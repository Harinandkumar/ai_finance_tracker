// utils/ocr.js
const Tesseract = require('tesseract.js');

/**
 * India-focused OCR for receipts
 * Features:
 * - TOTAL / GRAND TOTAL / NET AMOUNT detection
 * - Fallback to last numeric line if total not detected
 * - Date parsing: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, Month DD, YYYY
 * - Vendor: top lines heuristics (ignore invoice/gstin/phone)
 */

function normalizeText(text) {
  return (text || '').replace(/\r/g, '');
}

function findAmountInLine(line) {
  if (!line) return null;
  const re = /(?:₹|\u20B9|Rs\.?|INR)?\s*([0-9]{1,3}(?:[,][0-9]{3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2}))/g;
  let m, candidates = [];
  while ((m = re.exec(line)) !== null) {
    let num = m[1].replace(/,/g, '');
    const val = parseFloat(num);
    if (!isNaN(val)) candidates.push(val);
  }
  if (candidates.length) return candidates[candidates.length - 1];
  return null;
}

function isLikelyYearNumber(n) {
  return n >= 1900 && n <= 2100;
}

function extractTotalFromLines(lines) {
  const totalKeywords = ['grand total', 'grandtotal', 'total amount', 'amount due', 'amount', 'net amount', 'net payable', 'balance due', 'payable'];

  // scan from bottom (last lines usually have total)
  for (let i = lines.length - 1; i >= 0; i--) {
    const L = lines[i].toLowerCase().replace(/[^a-z0-9 ]/g,'');
    for (const kw of totalKeywords) {
      if (L.includes(kw)) {
        const amt = findAmountInLine(lines[i]);
        if (amt !== null && amt < 1000000) return { amount: amt, source: 'total-line', lineIndex: i, lineText: lines[i] };
        if (i + 1 < lines.length) {
          const nextAmt = findAmountInLine(lines[i + 1]);
          if (nextAmt !== null && nextAmt < 1000000) return { amount: nextAmt, source: 'total-next-line', lineIndex: i + 1, lineText: lines[i + 1] };
        }
      }
    }
  }

  // fallback: last numeric value not a year
  for (let i = lines.length - 1; i >= 0; i--) {
    const amt = findAmountInLine(lines[i]);
    if (amt !== null && !isLikelyYearNumber(amt) && amt < 1000000) return { amount: amt, source:'last-line', lineIndex:i, lineText:lines[i] };
  }

  return null;
}

function extractDate(rawText, lines) {
  const datePatterns = [
    /(\b[0-3]?\d[\/\-\.][0-1]?\d[\/\-\.](?:20|19)?\d{2}\b)/,
    /(\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b)/,
    /([A-Za-z]{3,9}\s+[0-3]?\d,?\s*(?:20|19)?\d{2})/,
    /([0-3]?\d\s+[A-Za-z]{3,9}\s+(?:20|19)?\d{2})/
  ];

  for (const p of datePatterns) {
    const match = rawText.match(p);
    if (match && match[1]) {
      const parsed = Date.parse(match[1].replace(/(\d)(st|nd|rd|th)/, '$1'));
      if (!isNaN(parsed)) return new Date(parsed);
      const ddmmyyyy = match[1].match(/^([0-3]?\d)[\/\-\.]([0-1]?\d)[\/\-\.](\d{2,4})$/);
      if (ddmmyyyy) {
        let d = parseInt(ddmmyyyy[1], 10);
        let m = parseInt(ddmmyyyy[2], 10) - 1;
        let y = parseInt(ddmmyyyy[3], 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, m, d);
        if (!isNaN(dt)) return dt;
      }
    }
  }

  for (const L of lines) {
    for (const p of datePatterns) {
      const match = L.match(p);
      if (match && match[1]) {
        const parsed = Date.parse(match[1].replace(/(\d)(st|nd|rd|th)/, '$1'));
        if (!isNaN(parsed)) return new Date(parsed);
      }
    }
  }

  return new Date();
}

function extractVendor(lines) {
  const ignorePatterns = [/invoice/i, /receipt/i, /gstin/i, /gst/i, /phone/i, /tel:/i, /address/i, /tax/i, /invoice no/i, /date/i, /bill/i, /cashier/i];
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const L = lines[i].trim();
    if (!L) continue;
    const alphaCount = (L.match(/[A-Za-z\u00A0-\u024F]/g) || []).length;
    if (alphaCount < 3) continue;
    let skip = false;
    for (const p of ignorePatterns) if (p.test(L)) { skip = true; break; }
    if (skip) continue;
    if (/^[\d\-\s,\/:]+$/.test(L)) continue;
    return L;
  }
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    if (lines[i].trim()) return lines[i].trim();
  }
  return 'Unknown';
}

async function runTesseract(filePath) {
  const res = await Tesseract.recognize(filePath, 'eng', {
    logger: m => {}
  });
  return res.data;
}

async function processReceipt(filePath) {
  const data = await runTesseract(filePath);
  const rawText = normalizeText(data.text || '');
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let totalInfo = extractTotalFromLines(lines);

  if (!totalInfo) totalInfo = { amount: 0, source: 'none' };

  let amount = totalInfo.amount || 0;
  const amountSource = totalInfo.source || 'none';

  if (isLikelyYearNumber(amount)) {
    const alt = extractTotalFromLines(lines);
    if (alt && !isLikelyYearNumber(alt.amount)) amount = alt.amount;
    else amount = 0;
  }

  const date = extractDate(rawText, lines);
  const vendor = extractVendor(lines);

  return { amount, date, vendor: vendor || 'Unknown', raw: rawText, amountSource };
}

module.exports = { processReceipt };
