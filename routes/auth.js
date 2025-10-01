const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const { ensureGuest, ensureAuth } = require('../middleware/auth');

// register
router.get('/register', ensureGuest, (req, res) => {
  res.render('register', { title: 'Register' });
});

router.post('/register', ensureGuest,
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array().map(e => e.msg).join(', ');
      return res.redirect('/register');
    }
    const { name, email, password } = req.body;
    try {
      const exists = await User.findOne({ email });
      if (exists) {
        req.session.error = 'Email already registered';
        return res.redirect('/register');
      }
      const user = await User.createUser({ name, email, password });
      req.session.user = { id: user._id, name: user.name, email: user.email };
      req.session.success = 'Account created';
      return res.redirect('/expenses/dashboard');
    } catch (err) {
      console.error(err);
      req.session.error = 'Registration failed';
      return res.redirect('/register');
    }
  }
);

// login
router.get('/login', ensureGuest, (req, res) => {
  res.render('login', { title: 'Login' });
});

router.post('/login', ensureGuest,
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array().map(e => e.msg).join(', ');
      return res.redirect('/login');
    }
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user) {
        req.session.error = 'Invalid credentials';
        return res.redirect('/login');
      }
      const ok = await user.verifyPassword(password);
      if (!ok) {
        req.session.error = 'Invalid credentials';
        return res.redirect('/login');
      }
      req.session.user = { id: user._id, name: user.name, email: user.email };
      req.session.success = 'Logged in';
      return res.redirect('/expenses/dashboard');
    } catch (err) {
      console.error(err);
      req.session.error = 'Login failed';
      return res.redirect('/login');
    }
  }
);

// logout
router.post('/logout', ensureAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error', err);
      return res.redirect('/expenses/dashboard');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
