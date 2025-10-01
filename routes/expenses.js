const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { ensureAuth } = require('../middleware/auth');
const Expense = require('../models/Expense');
const { processReceiptFile } = require('../utils/ocr');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 12 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + uuidv4() + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpeg', '.jpg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error('Only .jpeg, .jpg, .png, .pdf allowed'));
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter
});

const ensureUploadDir = async () => {
  try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); } catch (e) { console.error('mkdir err', e); }
};
ensureUploadDir();

// dashboard
router.get('/dashboard', ensureAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const expenses = await Expense.find({ user: userId }).sort({ createdAt: -1 }).limit(200);
    res.render('dashboard', { title: 'Dashboard', expenses });
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not load dashboard';
    res.redirect('/');
  }
});

// manual entry
router.post('/add', ensureAuth,
  body('description').trim().escape(),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('category').trim().escape(),
  body('date').optional().isISO8601().toDate(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.session.error = errors.array().map(e=>e.msg).join(', ');
      return res.redirect('/expenses/dashboard');
    }
    try {
      const userId = req.session.user.id;
      const { description, amount, category, date, vendor } = req.body;
      const expense = await Expense.create({
        user: userId,
        description: description || '',
        amount: parseFloat(amount),
        category: category || 'Uncategorized',
        vendor: vendor || '',
        date: date ? new Date(date) : new Date()
      });
      req.session.success = 'Expense added';
      res.redirect('/expenses/dashboard');
    } catch (err) {
      console.error(err);
      req.session.error = 'Failed to add expense';
      res.redirect('/expenses/dashboard');
    }
  }
);

// upload and process
router.post('/upload', ensureAuth, upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    req.session.error = 'No file uploaded';
    return res.redirect('/expenses/dashboard');
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype || '';
  try {
    const result = await processReceiptFile(filePath, mimeType);

    const amount = result.amount || parseFloat(req.body.amount) || 0;
    const date = result.date || (req.body.date ? new Date(req.body.date) : new Date());
    const vendor = result.vendor || (req.body.vendor || '');
    const category = result.category || (req.body.category || 'Uncategorized');
    const description = req.body.description || (`Receipt: ${vendor}`.trim());

    const expense = await Expense.create({
      user: req.session.user.id,
      description,
      amount: amount || 0,
      category,
      vendor,
      date
    });

    expense.receiptFilename = req.file.filename;
    await expense.save();

    try { await fs.unlink(filePath); } catch (e) { console.warn('Could not delete uploaded file', e); }

    req.session.success = 'Receipt processed and expense added';
    res.redirect('/expenses/dashboard');
  } catch (err) {
    console.error(err);
    try { await fs.unlink(filePath); } catch(e){}
    req.session.error = 'Failed to process receipt';
    res.redirect('/expenses/dashboard');
  }
});

// delete
router.post('/delete/:id', ensureAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.session.user.id;
    const exp = await Expense.findOneAndDelete({ _id: id, user: userId });
    if (!exp) {
      req.session.error = 'Expense not found or not authorized';
      return res.redirect('/expenses/dashboard');
    }
    req.session.success = 'Expense deleted';
    res.redirect('/expenses/dashboard');
  } catch (err) {
    console.error(err);
    req.session.error = 'Could not delete expense';
    res.redirect('/expenses/dashboard');
  }
});

module.exports = router;
