const router = require('express').Router();

const { validateAgainstSchema } = require('../lib/validation');
const {
  UserSchema,
  insertNewUser,
  getUserById,
  validateUser,
  getUserByEmail
} = require('../models/users');
const { generateAuthToken, requireAuthentication } = require('../lib/auth');

const { getCourseByInsId, getCourseByStuId } = require('../models/courses');

router.post('/', async (req, res, next) => {
  if (validateAgainstSchema(req.body, UserSchema)) {
    if (req.body.role == "admin" || req.body.role == "instructor"){
      next();
    }
    else {
      try {
        const id = await insertNewUser(req.body);
        if (id.error){
          res.status(400).send({
            error: id.error
          });
        }
        else{
          res.status(201).send({
            _id: id
          });
        }
      } catch (err) {
        console.error("  -- Error:", err);
        res.status(500).send({
          error: "Error inserting new user.  Try again later."
        });
      }
    }
  } else {
    res.status(400).send({
      error: "Request body does not contain a valid User."
    });
  }
});

router.post('/', requireAuthentication, async (req, res) => {
  try {
    if (req.role != "admin"){
      res.status(403).send({
        error: "User is not authorized."
      });
    }
    else {
      const id = await insertNewUser(req.body);
      if (id.error){
        res.status(400).send({
          error: id.error
        });
      }
      else{
        res.status(201).send({
          _id: id
        });
      }
    }
  } catch (err) {
    console.error("  -- Error:", err);
    res.status(500).send({
      error: "Error inserting new user.  Try again later."
    });
  }
});

router.post('/login', async (req, res) => {
  if (req.body && req.body.email && req.body.password) {
    try {
      const authenticated = await validateUser(
        req.body.email,
        req.body.password
      );
      if (authenticated) {
        const token = await generateAuthToken(req.body.email);
        res.status(200).send({
          token: token
        });
      } else {
        res.status(401).send({
          error: "Invalid authentication credentials."
        })
      }
    } catch (err) {
      console.error("  -- error:", err);
      res.status(500).send({
        error: "Error logging in.  Try again later."
      });
    }
  } else {
    res.status(400).send({
      error: "Request body needs a user email and password."
    });
  }
});

router.get('/:id', requireAuthentication, async (req, res) => {
  if (req.id != req.params.id) {
    res.status(403).send({
      error: "Unauthorized to access the specified resource"
    });
  } else {
    if (req.role == "admin") {
      const result = await getUserById(req.params.id, true);
      res.status(200).send(result);
    }
    if (req.role == "instructor") {
      const results = await getCourseByInsId(req.params.id);
      console.log(results);
      res.status(200).send(results);
    }
    if (req.role == "student") {
      const results = await getCourseByStuId(req.params.id);
      res.status(200).send(results);
    }
  }
});

module.exports = router;
