module.exports.ensureAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.session.error = 'Please login to continue';
  return res.redirect('/login');
};

module.exports.ensureGuest = (req, res, next) => {
  if (!req.session.user) return next();
  return res.redirect('/expenses/dashboard');
};
