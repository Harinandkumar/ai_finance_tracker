# Expense Tracker

Full-stack Expense Tracker using Node.js, Express, MongoDB, and EJS.

## Features
- User authentication (register/login/logout) with sessions stored in MongoDB
- Dashboard showing latest 200 expenses
- Manual expense entry (description, amount, category, date, vendor)
- Delete expenses
- Receipt upload (image/pdf) with OCR & PDF text extraction
- Automatic detection: amount, date, vendor, category (simple keywords)
- Uploaded files auto-deleted after processing
- Multer file uploads (max 12 MB): .jpeg .jpg .png .pdf
- EJS-based frontend

## Setup
1. `git clone ...` or copy files
2. `npm install`
3. Create `.env` from `.env.example`
4. `mkdir uploads` (optional — app will create it)
5. `npm run dev` or `npm start`
6. Visit `http://localhost:3000`

## Notes
- For heavy usage, replace `tesseract.js` with a managed OCR API.
- For scanned PDFs (images inside PDF), use rasterization before OCR (poppler).
