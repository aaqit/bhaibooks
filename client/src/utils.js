export const pad = (n) => String(n).padStart(2, '0');

export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayISO = () => localISO();

export function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISO(d);
}

export function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

export function fyStartISO() {
  const d = new Date();
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-04-01`;
}

export function lastNMonthsISO(n = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() - (n - 1));
  d.setDate(1);
  return localISO(d);
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const numberFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const fmtNumber = (n) => numberFmt.format(Number(n) || 0);
export const fmtQty = (n) => qtyFmt.format(Number(n) || 0);
export const money = (n, symbol = '₹') => `${n < 0 ? '-' : ''}${symbol}${numberFmt.format(Math.abs(Number(n) || 0))}`;
export const plainMoney = (n) => numberFmt.format(Number(n) || 0);

export const VOUCHER_META = {
  SALES: { label: 'Sales', short: 'Sales', shortcut: 'F8', tone: 'good', prefix: 'SAL' },
  PURCHASE: { label: 'Purchase', short: 'Purchase', shortcut: 'F9', tone: 'info', prefix: 'PUR' },
  PAYMENT: { label: 'Payment', short: 'Payment', shortcut: 'F5', tone: 'bad', prefix: 'PAY' },
  RECEIPT: { label: 'Receipt', short: 'Receipt', shortcut: 'F6', tone: 'good', prefix: 'REC' },
  CONTRA: { label: 'Contra', short: 'Contra', shortcut: 'F4', tone: 'warn', prefix: 'CON' },
  JOURNAL: { label: 'Journal', short: 'Journal', shortcut: 'F7', tone: 'warn', prefix: 'JRN' },
  CREDIT_NOTE: { label: 'Credit Note', short: 'Credit Note', shortcut: 'Alt+F6', tone: 'bad', prefix: 'CRN' },
  DEBIT_NOTE: { label: 'Debit Note', short: 'Debit Note', shortcut: 'Alt+F5', tone: 'info', prefix: 'DBN' },
};

export const voucherLabel = (type) => VOUCHER_META[type]?.label || type;
export const voucherTone = (type) => VOUCHER_META[type]?.tone || 'info';

export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry',
];

export const GST_RATES = [0, 5, 12, 18, 28];

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function two(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function three(n) {
  const h = Math.floor(n / 100), rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', two(rest)].filter(Boolean).join(' ');
}
export function amountInWords(value) {
  let n = Math.round(Math.abs(Number(value) || 0));
  if (!n) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `${parts.join(' ')} Rupees Only`;
}

export function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(row => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export const SHORTCUTS = [
  { keys: 'Alt + F3', action: 'Company switch / select' },
  { keys: 'F8', action: 'New Sales voucher' },
  { keys: 'F9', action: 'New Purchase voucher' },
  { keys: 'F5', action: 'New Payment voucher' },
  { keys: 'F6', action: 'New Receipt voucher' },
  { keys: 'F4', action: 'New Contra voucher' },
  { keys: 'F7', action: 'New Journal voucher' },
  { keys: 'Alt + F5', action: 'New Debit Note' },
  { keys: 'Alt + F6', action: 'New Credit Note' },
  { keys: 'F1', action: 'Shortcut help' },
  { keys: 'Esc', action: 'Close dialog / go back' },
  { keys: 'Ctrl + Enter', action: 'Save voucher' },
];
