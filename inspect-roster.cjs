const fs = require('fs');
const XLSX = require('xlsx');
const p = 'public/default-roster.xlsx';
const wb = XLSX.read(fs.readFileSync(p), { type: 'array', cellDates: true });
console.log(JSON.stringify(wb.SheetNames));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: true });
for (let i = 0; i < Math.min(rows.length, 20); i++) {
  console.log('ROW ' + i, JSON.stringify(rows[i]));
}
