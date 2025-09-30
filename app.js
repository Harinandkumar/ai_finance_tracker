// app.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const Expense = require('./models/Expense');
const { processReceipt } = require('./utils/ocr');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect Mongo
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// EJS
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Multer
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Only images and PDF allowed'));
  }
});

// Ensure upload dir exists
(async () => {
  try {
    await fs.mkdir(uploadDir);
  } catch (e) {
    // ignore if exists
  }
})();

// Simple category rules
function detectCategory(vendor, description, rawText) {
  const map = {
    Food: ['restaurant', 'cafe', 'pizza', 'burger', 'dominos', 'zomato', 'swiggy', 'mcdonald', 'starbucks', 'kfc', 'hut'],
    Travel: ['uber', 'ola', 'taxi', 'bus', 'metro', 'flight', 'airlines', 'rail'],
    Grocery: ['grocery', 'supermarket', 'big bazaar', 'dmart', 'nature', 'reliance fresh', 'reliance', 'groceries'],
    Shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'shop', 'store'],
    Fuel: ['petrol', 'diesel', 'bp', 'bharat petroleum', 'hp', 'io', 'indian oil'],
    Bills: ['electricity', 'water', 'internet', 'phone', 'broadband', 'bill'],
    Entertainment: ['movie', 'cinema', 'bookmyshow', 'netflix', 'spotify']
  };

  const text = (vendor + ' ' + description + ' ' + rawText).toLowerCase();

  for (const [cat, keywords] of Object.entries(map)) {
    for (const k of keywords) {
      if (text.includes(k)) return cat;
    }
  }
  return 'Uncategorized';
}

// Routes
app.get('/', async (req, res) => {
  const expenses = await Expense.find().sort({ createdAt: -1 }).limit(200).lean();
  res.render('index', { expenses, message: null });
});

app.post('/upload', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    const expenses = await Expense.find().sort({ createdAt: -1 }).lean();
    return res.render('index', { expenses, message: 'No file uploaded' });
  }

  const filePath = req.file.path;
  try {
    const parsed = await processReceipt(filePath);
    const { amount, date, vendor, raw } = parsed;

    // If amount = 0 -> maybe OCR failed; still save as 0 but mark description
    const detectedDate = date || new Date();
    const detectedVendor = vendor || 'Unknown';
    const category = detectCategory(detectedVendor, 'Receipt', raw);

    // Save
    const expense = await Expense.create({
      description: 'Auto-imported receipt',
      vendor: detectedVendor,
      amount: amount || 0,
      category,
      date: detectedDate,
      paymentMode: 'Unknown',
      source: 'receipt',
      rawText: raw
    });

    // delete uploaded file to keep disk clean
    try { await fs.unlink(filePath); } catch (e) { /* ignore */ }

    const expenses = await Expense.find().sort({ createdAt: -1 }).lean();
    res.render('index', { expenses, message: `Saved expense ₹${expense.amount} (${expense.category})` });

  } catch (err) {
    console.error('Processing error:', err);
    try { await fs.unlink(filePath); } catch (e) {}
    const expenses = await Expense.find().sort({ createdAt: -1 }).lean();
    res.render('index', { expenses, message: 'Error processing receipt: ' + err.message });
  }
});

// Manual add route (optional)
app.post('/add', async (req, res) => {
  try {
    const { desc, amount, category, date } = req.body;
    const parsedAmount = parseFloat(amount) || 0;
    await Expense.create({
      description: desc || 'Manual',
      amount: parsedAmount,
      category: category || 'Uncategorized',
      date: date ? new Date(date) : new Date(),
      source: 'manual'
    });
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.redirect('/');
  }
});

app.listen(PORT, () => console.log(`App running at http://localhost:${PORT}`));
