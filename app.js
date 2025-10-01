require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');

const app = express();

// -------------------- DATABASE --------------------
// Use MongoDB Atlas if provided in env
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/expense_tracker';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error', err);
  process.exit(1); // stop server if DB fails
});

// -------------------- VIEW ENGINE --------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -------------------- MIDDLEWARES --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// -------------------- SESSION --------------------
const sessionStore = MongoStore.create({
  mongoUrl: MONGODB_URI,
  collectionName: 'sessions'
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// expose session to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = req.session.error || null;
  res.locals.success = req.session.success || null;
  delete req.session.error;
  delete req.session.success;
  next();
});

// -------------------- ROUTES --------------------
app.use('/', authRoutes);
app.use('/expenses', expenseRoutes);

// root redirect
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/expenses/dashboard');
  res.redirect('/login');
});

// 404
app.use((req, res) => res.status(404).render('404', { title: 'Not Found' }));

// error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  req.session.error = 'Something went wrong. Please try again.';
  res.redirect('back');
});

// -------------------- SERVER --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
