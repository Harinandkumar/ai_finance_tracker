// models/Expense.js
const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  description: { type: String, default: 'Receipt' },
  vendor: { type: String, default: '' },
  amount: { type: Number, required: true, default: 0 },
  category: { type: String, default: 'Uncategorized' },
  date: { type: Date, default: Date.now },
  paymentMode: { type: String, default: 'Unknown' },
  source: { type: String, default: 'receipt' },
  rawText: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expense', ExpenseSchema);
