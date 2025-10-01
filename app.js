require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const multer = require('multer');
const fs = require('fs/promises');

const { processReceiptFile } = require('./utils/ocr');
const User = require('./models/User');
const Expense = require('./models/Expense');

const app = express();

// -------------------- CONFIG --------------------
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || 'supersecret';
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_FILE_SIZE = 12 * 1024 * 1024; // 12 MB

// -------------------- MIDDLEWARE --------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// -------------------- MONGODB --------------------
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// -------------------- SESSION --------------------
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { secure: NODE_ENV === 'production', maxAge: 1000*60*60*24 } // 1 day
}));

// -------------------- MULTER SETUP --------------------
const upload = multer({
  dest: path.join(__dirname, 'uploads/'),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = file.originalname.toLowerCase().match(allowed);
    if (ext) cb(null, true);
    else cb(new Error('Only .jpeg, .jpg, .png, .pdf allowed'));
  }
});

// -------------------- AUTH MIDDLEWARE --------------------
function isAuthenticated(req,res,next){
  if(req.session.userId) return next();
  res.redirect('/login');
}

// -------------------- ROUTES --------------------

// Home redirect
app.get('/', (req,res)=> res.redirect('/dashboard'));

// -------------------- REGISTER --------------------
app.get('/register', (req,res)=> res.render('register'));
app.post('/register', async (req,res)=>{
  try{
    const { name,email,password } = req.body;
    const user = new User({ name,email,password });
    await user.save();
    req.session.userId = user._id;
    res.redirect('/dashboard');
  }catch(err){
    res.send("Registration error: " + err.message);
  }
});

// -------------------- LOGIN --------------------
app.get('/login', (req,res)=> res.render('login'));
app.post('/login', async (req,res)=>{
  try{
    const { email,password } = req.body;
    const user = await User.findOne({ email,password });
    if(!user) return res.send("Invalid credentials");
    req.session.userId = user._id;
    res.redirect('/dashboard');
  }catch(err){
    res.send("Login error: " + err.message);
  }
});

// -------------------- LOGOUT --------------------
app.get('/logout', (req,res)=>{
  req.session.destroy();
  res.redirect('/login');
});

// -------------------- DASHBOARD --------------------
app.get('/dashboard', isAuthenticated, async (req,res)=>{
  const expenses = await Expense.find({ user: req.session.userId }).sort({ date: -1 }).limit(200);
  res.render('dashboard',{ expenses });
});

// -------------------- ADD EXPENSE --------------------
app.post('/expense/add', isAuthenticated, async (req,res)=>{
  try{
    const { description, amount, category, date } = req.body;
    const exp = new Expense({
      user: req.session.userId,
      description, amount, category, date: date || new Date()
    });
    await exp.save();
    res.redirect('/dashboard');
  }catch(err){ res.send("Add expense error: "+err.message); }
});

// -------------------- DELETE EXPENSE --------------------
app.get('/expense/delete/:id', isAuthenticated, async (req,res)=>{
  try{
    await Expense.deleteOne({ _id:req.params.id, user:req.session.userId });
    res.redirect('/dashboard');
  }catch(err){ res.send("Delete expense error: "+err.message); }
});

// -------------------- UPLOAD RECEIPT --------------------
app.post('/expense/upload', isAuthenticated, upload.single('receipt'), async (req,res)=>{
  if(!req.file) return res.send("No file uploaded");
  try{
    const result = await processReceiptFile(req.file.path);

    const expense = new Expense({
      user: req.session.userId,
      description: result.vendor,
      amount: result.amount,
      category: result.category,
      date: result.date
    });
    await expense.save();

    // Delete uploaded file
    await fs.unlink(req.file.path);

    res.redirect('/dashboard');
  }catch(err){
    console.error(err);
    res.send("Receipt processing failed: "+err.message);
  }
});

// -------------------- START SERVER --------------------
app.listen(PORT, ()=>{
  console.log(`Server running on port ${PORT}`);
  console.log(`NODE_ENV=${NODE_ENV}`);
});
