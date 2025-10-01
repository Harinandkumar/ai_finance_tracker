const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.methods.verifyPassword = function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.statics.createUser = async function({ name, email, password }) {
  const saltRounds = 10;
  const pwHash = await bcrypt.hash(password, saltRounds);
  return this.create({ name, email, passwordHash: pwHash });
};

module.exports = mongoose.model('User', UserSchema);
