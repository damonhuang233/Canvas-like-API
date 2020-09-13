const { ObjectId, GridFSBucket } = require('mongodb');
const fs = require('fs');

const { getDBReference } = require('../lib/mongo');
const { extractValidFields } = require('../lib/validation');

const {
   getCourseById,
   getAssignmentByCourseId
 } = require('./courses');

 const { getUserById } = require('./users');

const AssignmentSchema = {
  courseId: { require: true },
  title: { require: true },
  points: { require: true },
  due: { require: true }
};
exports.AssignmentSchema = AssignmentSchema;

exports.insertNewAssignment = async function (assignment) {
  const assignmentToInsert = extractValidFields(assignment, AssignmentSchema);
  console.log("  -- assignmentToInsert:", assignmentToInsert);
  const courseAssignment = await getAssignmentByCourseId(assignmentToInsert.courseId);
  if (courseAssignment) {
    const db = getDBReference();
    const collection = db.collection('assignments');
    assignmentToInsert.submissions = [];
    const result = await collection.insertOne(assignmentToInsert);
    const id = result.insertedId;
    const courses = db.collection('courses');
    courseAssignment.push(id);
    const updateResult = await courses.updateOne(
      { _id: ObjectId(assignmentToInsert.courseId) },
      { $set: { assignments: courseAssignment } }
    );
    return id;
  }
  else {
    return null;
  }
};

async function getAssignmentById (id, showSubmission) {
  const db = getDBReference();
  const collection = db.collection('assignments');
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const projection = showSubmission ? {} : { submissions: 0 };
    const results = await collection
      .find({ _id: new ObjectId(id) })
      .project(projection)
      .toArray();
    return results[0];
  }
}
exports.getAssignmentById = getAssignmentById;

exports.updateAssignmentById = async function (id, assignment) {
  const db = getDBReference();
  const collection = db.collection('assignments');
  await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: assignment }
  );
}

exports.deleteAssignmentById = async function (id) {
  const db = getDBReference();
  const collection = db.collection('assignments');
  if (!ObjectId.isValid(id)) {
    return null;
  }
  else {
    const assignment = await getAssignmentById(id, true);
    if (!assignment) {
      return null;
    }
    else {
      const bucket = new GridFSBucket(db, {
        bucketName: 'submissions'
      });
      var i;
      for (i = 0; i < assignment.submissions; i++) {
        const sub_id = assignment.submissions[i];
        await bucket.deleteOne({
          _id: new ObjectId(sub_id)
        });
      }
      const courseId = assignment.courseId;
      const courseAssignment = await getAssignmentByCourseId(courseId);
      for (i = 0; i < courseAssignment.length; i++){
        if (courseAssignment[i] == id){
          courseAssignment.splice(i, 1);
          break;
        }
      }
      const courses = db.collection('courses');
      await courses.updateOne(
        { _id: new ObjectId(courseId) },
        { $set: { assignments: courseAssignment } }
      );
      const result = await collection.deleteOne({
        _id: new ObjectId(id)
      });
      return result.deletedCount > 0;
    }
  }
}

exports.saveSubmission = async function (submission) {
  const assignment = await getAssignmentById(submission.assignmentId, true);
  if (!assignment) {
    return null;
  }
  else {
    const db = getDBReference();
    const courses = db.collection('courses');
    const course = await courses
      .find({ _id: new ObjectId(assignment.courseId) })
      .toArray();
    const students = course[0].students;
    if ( !students.includes(submission.studentId) ){
      return null;
    }
    else {
      const id = await saveSubmissionFile(submission);
      const collection = db.collection('assignments');
      const submissions = assignment.submissions;
      submissions.push(id);
      await collection.updateOne(
        { _id: new ObjectId(submission.assignmentId) },
        { $set: { submissions: submissions } }
      );
      return id;
    }
  }
}

async function saveSubmissionFile (submission) {
  return new Promise((resolve, reject) => {
    const db = getDBReference();
    const bucket = new GridFSBucket(db, {
      bucketName: 'submissions'
    });
    const metadata = {
      contentType: submission.contentType,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      timestamp: submission.timestamp
    };

    const uploadStream = bucket.openUploadStream(
      submission.filename,
      { metadata: metadata }
    );
    fs.createReadStream(submission.path).pipe(uploadStream)
      .on('error', (err) => {
        reject(err);
      })
      .on('finish', (result) => {
        resolve(result._id);
      });
  });
};
exports.saveSubmissionFile = saveSubmissionFile;

async function getSubmissionInfoById (id) {
  const db = getDBReference();
  const bucket = new GridFSBucket(db, {
    bucketName: 'submissions'
  });
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const results = await bucket.find({ _id: new ObjectId(id) })
      .toArray();
    return results[0];
  }
};

exports.getSubmissionDownloadStreamByFilename = function (filename) {
  const db = getDBReference();
  const bucket = new GridFSBucket(db, {
    bucketName: 'submissions'
  });
  return bucket.openDownloadStreamByName(filename);
};

exports.getAssignmentSubmissionPage = async function (submissions, page) {
  const pageSize = 10;
  const count = submissions.length;
  const lastPage = Math.ceil(count / pageSize);
  page = page > lastPage ? lastPage : page;
  page = page < 1 ? 1 : page;
  const offset = (page - 1) * pageSize;

  const pageSubmissions = [];
  const db = getDBReference();
  const bucket = new GridFSBucket(db, { bucketName: 'submissions' });

  var i;
  for (i = offset; i < count; i++) {
    const id = submissions[i];
    const submission = await getSubmissionInfoById(id);
    const responseBody = {
      assignmentId: submission.metadata.assignmentId,
      studentId: submission.metadata.studentId,
      timestamp: submission.metadata.timestamp,
      file: `/submissions/${submission.filename}`
    };
    pageSubmissions.push(responseBody);
  }

  return {
    submissions: pageSubmissions,
    page: page,
    totalPages: lastPage,
    pageSize: pageSize,
    count: count
  }
};
