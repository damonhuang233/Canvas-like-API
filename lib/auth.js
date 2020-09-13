const jwt = require('jsonwebtoken');

const secretKey = 'NotASecretKey';

const { getUserByEmail } = require('../models/users');

exports.generateAuthToken = async function (userEmail) {
  const user = await getUserByEmail(userEmail);
  const payload = { id: user._id ,email: user.email, role: user.role };
  return jwt.sign(payload, secretKey, { expiresIn: '24h' });
};

exports.requireAuthentication = function (req, res, next) {
  /*
   * Authorization: Bearer <token>
   */
  const authHeader = req.get('Authorization') || '';
  const authHeaderParts = authHeader.split(' ');
  const token = authHeaderParts[0] === 'Bearer' ?
    authHeaderParts[1] : null;
  if ( !token ){
    next();
  }
  else {
    try {
      const payload = jwt.verify(token, secretKey);
      req.id = payload.id;
      req.role = payload.role;
      next();
    } catch (err) {
      console.error("  -- error:", err);
      res.status(401).send({
        error: "Invalid authentication token"
      });
    }
  }
};
