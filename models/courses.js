const { ObjectId, GridFSBucket } = require('mongodb');
const fs = require('fs');

const { getDBReference } = require('../lib/mongo');
const { extractValidFields } = require('../lib/validation');

const { getUserById } = require('./users');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const CourseSchema = {
  subject: { required: true },
  number: { required: true },
  title: { required: true },
  term: { required: true },
  instructorId: { required: true }
};
exports.CourseSchema = CourseSchema;

exports.getCoursesPage = async function (page) {
  const pageSize = 10;

  const db = getDBReference();
  const collection = db.collection('courses');

  const count = await collection.countDocuments();
  const lastPage = Math.ceil(count / pageSize);
  page = page > lastPage ? lastPage : page;
  page = page < 1 ? 1 : page;
  const offset = (page - 1) * pageSize;

  const projection = { students: 0, assignments: 0 };
  const results = await collection.find({})
    .sort({ _id: 1 })
    .skip(offset)
    .limit(pageSize)
    .project(projection)
    .toArray();

  return {
    courses: results,
    page: page,
    totalPages: lastPage,
    pageSize: pageSize,
    count: count
  };
};

exports.insertNewCourse = async function (course) {
  const courseToInsert = extractValidFields(course, CourseSchema);
  courseToInsert.students = [];
  courseToInsert.assignments = [];
  const db = getDBReference();
  const collection = db.collection('courses');
  const result = await collection.insertOne(courseToInsert);
  return result.insertedId;
};

async function getCourseById (id) {
  const db = getDBReference();
  const collection = db.collection('courses');
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const projection = { students: 0, assignments: 0 };
    const results = await collection
      .find({ _id: new ObjectId(id) })
      .project(projection)
      .toArray();
    return results[0];
  }
};
exports.getCourseById = getCourseById;

exports.updateCourseById = async function (id, course) {
  const db = getDBReference();
  const collection = db.collection('courses');
  await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: course }
  );
}

exports.deleteCourseById = async function (id) {
  const db = getDBReference();
  const assignments = db.collection('assignments');
  if (!ObjectId.isValid(id)) {
    return null;
  }
  else {
    await assignments.deleteMany({
      courseId: id
    });
    const collection = db.collection('courses');
    const result = await collection.deleteOne({
      _id: new ObjectId(id)
    });
    return result.deletedCount > 0;
  }
}

exports.updateEnrollmentById = async function (id, enrollment) {
  const db = getDBReference();
  const collection = db.collection('courses');
  if (!ObjectId.isValid(id)) {
    return null;
  }
  else {
    const course = await getCourseById(id);
    if (!course) {
      return null;
    }
    else {
      const students = await getEnrollmentById(id);
      if (enrollment.add) {
        var i;
        for (i = 0; i < enrollment.add.length; i++) {
          const user = await getUserById(enrollment.add[i], false);
          if (!user || user.role != "student"){
            enrollment.add.splice(i, 1);
          }
        }
        enrollment.add.forEach( (item, idx) => {
          if (!students.includes(item)){
            students.push(item);
          }
        });
      }
      if (enrollment.remove) {
        enrollment.remove.forEach((item, idx) => {
          var i;
          for (i = 0; i < students.length; i++){
            if (students[i] == item) {
              students.splice(i, 1);
              break;
            }
          }
        });
      }
      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { students: students } }
      );
      return result;
    }
  }
}

async function getEnrollmentById(id){
  const db = getDBReference();
  const collection = db.collection('courses');
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const results = await collection
      .find({ _id: new ObjectId(id) })
      .toArray();
    if (!results[0]) {
      return null;
    }
    else {
      return results[0].students;
    }
  }
}
exports.getEnrollmentById = getEnrollmentById;

async function getAssignmentByCourseId(id){
  const db = getDBReference();
  const collection = db.collection('courses');
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const results = await collection
      .find({ _id: new ObjectId(id) })
      .toArray();
    if (!results[0]) {
      return null;
    }
    else {
      return results[0].assignments;
    }
  }
}
exports.getAssignmentByCourseId = getAssignmentByCourseId;

exports.getCourseByInsId = async function (id) {
  const db = getDBReference();
  const collection = db.collection('courses');
  const projection = {students: 0, assignments: 0};
  const results = await collection
    .find({ instructorId: id})
    .project(projection)
    .toArray();
  return results;
}

exports.getCourseByStuId = async function (id) {
  const db = getDBReference();
  const collection = db.collection('courses');
  const projection = {students: 0, assignments: 0};
  const results = await collection
    .find({ students: { $elemMatch: { $eq:id } } })
    .project(projection)
    .toArray();
  return results;
}

exports.generateStudentsCSVById = async function (id) {
  const students = await getEnrollmentById(id);
  if (!students) {
    return null;
  }
  else {
    const contents = [];
    var i;
    for (i = 0; i < students.length; i++) {
      const studentId = students[i];
      const student = await getUserById(studentId, false);
      const data = {};
      data.studentId = studentId;
      data.name = student.name;
      data.email = student.email;
      contents.push(data);
    }
    const filename = id + ".csv";
    const path = "/usr/src/app/" + filename;
    const csvWriter = createCsvWriter({
      path: path,
      header: [
        {id: 'studentId', title: 'Student ID'},
        {id: 'name', title: 'Name'},
        {id: 'email', title: 'Email'}
      ]
    });
    csvWriter.writeRecords(contents).then(() => {
      console.log("Generated CSV file.");
    });
    const csv = {path: path, courseId: id, filename: filename};
    return csv;
  }
}

async function saveCSVFile (csv) {
  return new Promise((resolve, reject) => {
    const db = getDBReference();
    const bucket = new GridFSBucket(db, {
      bucketName: 'csv'
    });
    const metadata = {
      CourseId: csv.courseId
    };

    const uploadStream = bucket.openUploadStream(
      csv.filename,
      { metadata: metadata }
    );
    fs.createReadStream(csv.path).pipe(uploadStream)
      .on('error', (err) => {
        reject(err);
      })
      .on('finish', (result) => {
        resolve(result._id);
      });
  });
};
exports.saveCSVFile = saveCSVFile;

exports.getCSVDownloadStreamById = function (id) {
  const db = getDBReference();
  const bucket = new GridFSBucket(db, {
    bucketName: 'csv'
  });
  return bucket.openDownloadStream(id);
};
