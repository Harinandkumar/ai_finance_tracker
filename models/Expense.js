const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'Uncategorized' },
  vendor: { type: String, default: '' },
  date: { type: Date, required: true },
  receiptFilename: { type: String },
  createdAt: { type: Date, default: Date.now }
});

ExpenseSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
