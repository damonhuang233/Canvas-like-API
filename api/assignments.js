const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');

const { validateAgainstSchema, extractValidFields } = require('../lib/validation');

const {
  AssignmentSchema,
  insertNewAssignment,
  getAssignmentById,
  updateAssignmentById,
  deleteAssignmentById,
  saveSubmission,
  getAssignmentSubmissionPage
} = require('../models/assignments');

const supportFileTypes = {
  'text/plain': 'txt',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

const { getCourseById } = require('../models/courses');

const { requireAuthentication } = require('../lib/auth');

const upload = multer({
  storage: multer.diskStorage({
    destination: `/usr/src/app/uploads`,
    filename: (req, file, callback) => {
      const filename = crypto.pseudoRandomBytes(16).toString('hex');
      console.log(file.mimetype);
      const extension = supportFileTypes[file.mimetype];
      callback(null, `${filename}.${extension}`);
    }
  }),
  fileFilter: (req, file, callback) => {
  callback(null, !!supportFileTypes[file.mimetype])
  }
});

router.post('/', requireAuthentication, async (req, res) => {
  if (validateAgainstSchema(req.body, AssignmentSchema)) {
    const course = await getCourseById(req.body.courseId);
    if (!course) {
      res.status(403).send({
        error: "Course does not exist."
      });
    }
    else {
      if (req.role != "admin" && req.id != course.instructorId) {
        res.status(403).send({
          error: "User is not authorized."
        });
      }
      else {
        const id = await insertNewAssignment(req.body);
        res.status(201).send({
          _id: id
        });
      }
    }
  }
  else {
    res.status(400).send({
      error: "Request body does not contain a valid Assignment."
    });
  }
});

router.get('/:id', async(req, res, next) => {
  const result = await getAssignmentById(req.params.id, false);
  if (result) {
    res.status(200).send(result);
  }
  else {
    next();
  }
});

router.patch('/:id', requireAuthentication, async (req, res, next) => {
  const assignment = await getAssignmentById(req.params.id);
  if (assignment) {
    const assignmentToUpdate = extractValidFields(req.body, AssignmentSchema);
    if (Object.keys(assignmentToUpdate).length === 0){
      res.status(400).send({
        error: "Nothing to update."
      });
    }
    else {
      if (assignmentToUpdate.courseId) {
        const course = await getCourseById(assignmentToUpdate.courseId);
        if (!course) {
          res.status(400).send({
            error: "Course does not exist."
          });
        }
        else {
          if (req.role != "admin" && req.id != course.instructorId) {
            res.status(403).send({
              error: "Unauthorized to patch the specified resource."
            });
          }
          else {
            await updateAssignmentById(req.params.id, assignmentToUpdate);
            res.status(200).send();
          }
        }
      }
    }
  }
  else {
    next();
  }
});

router.delete('/:id', requireAuthentication, async (req, res, next) => {
  const assignment = await getAssignmentById(req.params.id);
  if (assignment) {
    const course = await getCourseById(assignment.courseId);
    if (req.role != "admin" && req.id != course.instructorId) {
      res.status(403).send({
        error: "Unauthorized to delete the specified resource."
      });
    }
    else {
      await deleteAssignmentById(req.params.id);
      res.status(204).send();
    }
  }
  else {
    next();
  }
});

router.post('/:id/submissions', requireAuthentication, upload.single('file'), async (req, res, next) => {
  if (req.file && req.body && req.body.assignmentId && req.body.studentId && req.body.timestamp &&req.params.id == req.body.assignmentId) {
    if (req.id != req.body.studentId) {
      res.status(403).send({
        error: "Unauthorized to submit the specified resource."
      });
    }
    else {
      const submission = {
        contentType: req.file.mimetype,
        filename: req.file.filename,
        path: req.file.path,
        assignmentId: req.body.assignmentId,
        studentId: req.body.studentId,
        timestamp: req.body.timestamp
      }
      const id = await saveSubmission(submission);
      if ( !id ){
        next();
      }
      else {
        res.status(201).send({
          _id: id
        });
      }
    }
  }
  else {
    res.status(400).send({
      error: "Invalid request body."
    });
  }
});

router.get('/:id/submissions', requireAuthentication, async (req, res, next) => {
  const assignment = await getAssignmentById(req.params.id, true);
  if (!assignment) {
    next();
  }
  else {
    const course = await getCourseById(assignment.courseId);
    if (req.role != "admin" && req.id != course.instructorId){
      res.status(403).send({
        error: "Unauthorized to fetch the specified resource."
      });
    }
    else {
      const submissionsPage = parseInt(req.query.page) || 1;
      const page = await getAssignmentSubmissionPage(assignment.submissions, submissionsPage);
      res.status(200).send(page);
    }
  }
});

module.exports = router;
