const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const { getDBReference } = require('../lib/mongo');
const { extractValidFields } = require('../lib/validation');

const UserSchema = {
  name: { required: true },
  email: { required: true },
  password: { required: true },
  role: { required: true }
};
exports.UserSchema = UserSchema;

exports.insertNewUser = async function (user) {
  const has_user = await getUserByEmail(user.email);
  if (has_user) {
    return { error: "Email already existed." };
  }
  const userToInsert = extractValidFields(user, UserSchema);
  console.log("  -- userToInsert:", userToInsert);
  userToInsert.password = await bcrypt.hash(
    userToInsert.password,
    8
  );
  console.log("  -- userToInsert after hash:", userToInsert);
  const db = getDBReference();
  const collection = db.collection('users');
  const result = await collection.insertOne(userToInsert);
  return result.insertedId;
};

exports.getUserById = async function (id, includePassword) {
  const db = getDBReference();
  const collection = db.collection('users');
  if (!ObjectId.isValid(id)) {
    return null;
  } else {
    const projection = includePassword ? {} : { password: 0 };
    const results = await collection
      .find({ _id: new ObjectId(id) })
      .project(projection)
      .toArray();
    return results[0];
  }
};

async function getUserByEmail ( email ) {
  const db = getDBReference();
  const collection = db.collection('users');
  const results = await collection
    .find({ email: email })
    .toArray();
  if ( !results ){
    return null;
  }
  return results[0];
};
exports.getUserByEmail = getUserByEmail;

exports.validateUser = async function(email, password) {
  const user = await exports.getUserByEmail(email);
  return user &&
    await bcrypt.compare(password, user.password);
};
