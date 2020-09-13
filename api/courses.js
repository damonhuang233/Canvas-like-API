const router = require('express').Router();

const { validateAgainstSchema, extractValidFields } = require('../lib/validation');

const {
  CourseSchema,
  insertNewCourse,
  getCoursesPage,
  getCourseById,
  updateCourseById,
  deleteCourseById,
  updateEnrollmentById,
  getEnrollmentById,
  getAssignmentByCourseId,
  generateStudentsCSVById,
  saveCSVFile,
  getCSVDownloadStreamById
} = require('../models/courses');

const { getUserById } = require('../models/users');

const { requireAuthentication } = require('../lib/auth');

router.post('/', requireAuthentication, async (req, res) => {
  if (req.role != "admin"){
    res.status(403).send({
      error: "User is not authorized."
    });
  } else {
    if (validateAgainstSchema(req.body, CourseSchema)) {
      try {
        const user = await getUserById(req.body.instructorId, false);
        if (!user || user.role != "instructor" ) {
          res.status(400).send({
            error: "Instructor dose not exist."
          });
        }
        else {
          const id = await insertNewCourse(req.body);
          res.status(201).send({
            _id: id
          });
        }
      } catch (err) {
        console.error("  -- Error:", err);
        res.status(500).send({
          error: "Error inserting new course.  Try again later."
        });
      }
    }
    else {
      res.status(400).send({
        error: "Request body does not contain a valid User."
      });
    }
  }
});

router.get('/', async (req, res) => {
  try {
    const coursesPage = await getCoursesPage(
      parseInt(req.query.page) || 1
    );
    res.status(200).send(coursesPage);
  } catch (err) {
    console.error(" -- error:", err);
    res.status(500).send({
      error: "Error fetching courses page."
    });
  }
});

router.get('/:id/students', requireAuthentication, async (req, res, next) => {
  if (req.role != "admin" && req.id != req.params.id){
    res.status(403).send({
      error: "Unauthorized to fetch the specified resource."
    });
  } else {
    const result = await getEnrollmentById(req.params.id);
    if (result) {
      res.status(200).send(result);
    }
    else {
      next();
    }
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getCourseById(req.params.id);
    if (result) {
      res.status(200).send(result);
    }
    else {
      next();
    }
  } catch (err) {
    console.error(" -- error:", err);
    res.status(500).send({
      error: "Error fetching course."
    });
  }
});

router.patch('/:id', requireAuthentication, async (req, res, next) => {
  const course = await getCourseById(req.params.id);
  if (course) {
    if (req.role == "admin" || req.id == course.instructorId) {
      const courseToUpdate = extractValidFields(req.body, CourseSchema);
      if (Object.keys(courseToUpdate).length === 0){
        res.status(400).send({
          error: "Nothing to update."
        });
      }
      else {
        if (courseToUpdate.instructorId) {
          const user = await getUserById(courseToUpdate.instructorId, false);
          if (!user || user.role != "instructor") {
            res.status(400).send({
              error: "Instructor does not exist."
            });
          }
          else {
            await updateCourseById(req.params.id, courseToUpdate);
            res.status(200).send();
          }
        }
        else {
          await updateCourseById(req.params.id, courseToUpdate);
          res.status(200).send();
        }
      }
    }
    else {
      res.status(403).send({
        error: "Unauthorized to patch the specified resource."
      });
    }
  }
  else {
    next();
  }
});

router.post('/:id/students', requireAuthentication, async (req, res, next) => {
  if (req.role != "admin" && req.id != req.params.id){
    res.status(403).send({
      error: "Unauthorized to update the specified resource."
    });
  }
  else {
    const body = {};
    if(Array.isArray(req.body.add)){
      body.add = req.body.add;
    }
    if(Array.isArray(req.body.remove)){
      body.remove = req.body.remove;
    }
    if ( body.add || body.remove ) {
      const result = await updateEnrollmentById(req.params.id, body);
      if (!result) {
        next();
      }
      else {
        res.status(200).send();
      }
    }
    else {
      res.status(400).send({
        error: "Request body does not contains require field."
      });
    }
  }
});

router.delete('/:id', requireAuthentication, async (req, res, next) => {
  if (req.role != "admin") {
    res.status(403).send({
      error: "Unauthorized to delete the specified resource."
    });
  }
  else {
    const result = await deleteCourseById(req.params.id);
    if (result) {
      res.status(204).send();
    }
    else {
      next();
    }
  }
});

router.get('/:id/assignments', async (req, res, next) => {
  const result = await getAssignmentByCourseId(req.params.id);
  if (!result) {
    next();
  }
  else {
    res.status(200).send(result);
  }
});

router.get('/:id/roster', requireAuthentication, async (req, res, next) => {
  if (req.role != "admin" && req.id != req.params.id) {
    res.status(403).send({
      error: "Unauthorized to fetch the specified resource."
    });
  } else {
    const csv = await generateStudentsCSVById(req.params.id);
    if ( !csv ){
      next();
    } else {
      const id = await saveCSVFile(csv);
      if (! id ){
        next();
      } else {
        getCSVDownloadStreamById(id)
         .on('file', (file) => {
           res.status(200).type('text/csv');
         })
         .on('error', (err) => {
           if (err.code === 'ENOENT') {
             next();
           } else {
             next(err);
           }
         })
         .pipe(res);
      }
    }
  }
});

module.exports = router;
