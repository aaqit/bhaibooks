import express from 'express';
import { authenticate, requireCap, requireCompany } from '../auth.js';
import { wrap, dateRange, asOn, requireAnyCap } from './helpers.js';
import * as R from '../lib/reports.js';

const router = express.Router();
router.use(authenticate, requireCompany);

router.get('/dashboard', requireCap('dashboard'), wrap((req, res) => {
  let { from, to } = dateRange(req);
  const today = new Date().toISOString().slice(0, 10);
  if (!req.query.from) {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    from = start.toISOString().slice(0, 10);
    to = today;
  }
  const start = new Date(`${to}T00:00:00`);
  start.setMonth(start.getMonth() - 5);
  start.setDate(1);
  const seriesFrom = start.toISOString().slice(0, 10);
  res.json({ data: R.dashboard(req.db, from, to, seriesFrom), from, to, today });
}));

router.get('/daybook', requireCap('daybook'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  res.json(R.daybook(req.db, from, to));
}));

router.get('/ledger', requireAnyCap('reports', 'reports:financial'), wrap((req, res) => {
  const ledgerId = Number(req.query.ledger_id);
  if (!ledgerId) return res.status(400).json({ error: 'ledger_id required' });
  const { from, to } = dateRange(req);
  res.json(R.ledgerStatement(req.db, ledgerId, from, to));
}));

router.get('/trial-balance', requireCap('reports:financial'), wrap((req, res) => {
  res.json(R.trialBalance(req.db, asOn(req)));
}));

router.get('/profit-loss', requireCap('reports:financial'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  const fy = req.db.prepare("SELECT value FROM settings WHERE key='books_from'").get()?.value || `${to.slice(0, 4)}-04-01`;
  res.json(R.profitLoss(req.db, req.query.from ? from : fy, to));
}));

router.get('/balance-sheet', requireCap('reports:financial'), wrap((req, res) => {
  res.json(R.balanceSheet(req.db, asOn(req)));
}));

router.get('/stock-summary', requireCap('stock'), wrap((req, res) => {
  const saved = req.db.prepare("SELECT value FROM settings WHERE key='stock_valuation'").get()?.value || 'AVERAGE';
  const method = String(req.query.method || saved).toUpperCase();
  res.json(R.stockSummary(req.db, { method }));
}));

router.get('/cash-flow', requireCap('reports:financial'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  res.json(R.cashFlow(req.db, from, to));
}));

router.get('/funds-flow', requireCap('reports:financial'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  res.json(R.fundsFlow(req.db, from, to));
}));

// Bill-by-bill outstanding: ?type=receivable|payable
router.get('/bill-wise', requireCap('reports:financial'), wrap((req, res) => {
  res.json(R.billWiseOutstanding(req.db, asOn(req), { type: req.query.type === 'payable' ? 'payable' : 'receivable' }));
}));

router.get('/expiry-alerts', requireCap('stock'), wrap((req, res) => {
  const saved = Number(req.db.prepare("SELECT value FROM settings WHERE key='expiry_alert_days'").get()?.value || 30);
  const days = Number.isFinite(Number(req.query.days)) && req.query.days !== undefined ? Number(req.query.days) : saved;
  res.json(R.expiryAlerts(req.db, asOn(req), days));
}));

router.get('/gst-summary', requireCap('gst'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  res.json(R.gstSummary(req.db, from, to));
}));

router.get('/gstr1', requireCap('gst'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  res.json(R.gstr1(req.db, from, to));
}));

router.get('/gstr1/export', requireCap('gst'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  const data = R.gstr1(req.db, from, to);
  const gst = R.gstSummary(req.db, from, to);
  const payload = {
    gstin: req.company.gstin,
    legal_name: req.company.name,
    period: { from, to },
    generated_at: new Date().toISOString(),
    summary: data.summary,
    b2b_invoices: data.b2b,
    b2c_invoices: data.b2c,
    credit_notes: data.creditNotes,
    hsn_summary: data.hsn,
    gstr3b: gst,
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${req.companyId}_${from}_${to}.json"`);
  res.send(JSON.stringify(payload, null, 2));
}));

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvBlock = (lines, title, headers, dataRows) => {
  lines.push([title]);
  lines.push(headers);
  for (const r of dataRows) lines.push(r);
  lines.push([]);
};

// Excel me seedha khulne wala CSV export (GSTR-1 + GSTR-3B + HSN summary).
router.get('/gstr1/export.csv', requireCap('gst'), wrap((req, res) => {
  const { from, to } = dateRange(req);
  const d = R.gstr1(req.db, from, to);
  const gst = R.gstSummary(req.db, from, to);
  const lines = [
    ['GSTR-1 / GSTR-3B Export'],
    ['Company', req.company.name, 'GSTIN', req.company.gstin || '-'],
    ['Period', `${from} to ${to}`, 'Generated', new Date().toISOString()],
    [],
  ];

  csvBlock(lines, 'A. Rate-wise Outward Summary', ['Section', 'Rate %', 'Tax Type', 'Taxable', 'CGST', 'SGST', 'IGST', 'Invoices'],
    d.summary.map(s => [s.section, s.rate, s.type, s.taxable, s.cgst, s.sgst, s.igst, s.invoices]));

  csvBlock(lines, 'B. B2B Invoices', ['Invoice No', 'Date', 'Party', 'GSTIN', 'Place of Supply', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
    d.b2b.map(i => [i.number, i.date, i.party_name, i.gstin, i.place_of_supply, i.taxable, i.cgst, i.sgst, i.igst, i.total]));

  csvBlock(lines, 'C. B2C Invoices', ['Invoice No', 'Date', 'Party', 'Place of Supply', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
    d.b2c.map(i => [i.number, i.date, i.party_name, i.place_of_supply, i.taxable, i.cgst, i.sgst, i.igst, i.total]));

  csvBlock(lines, 'D. HSN / SAC Summary', ['HSN', 'Item', 'Unit', 'Qty', 'Rate %', 'Taxable', 'CGST', 'SGST', 'IGST'],
    d.hsn.map(h => [h.hsn_code, h.item_name, h.unit, h.qty, h.gst_rate, h.taxable, h.cgst, h.sgst, h.igst]));

  csvBlock(lines, 'E. Credit Notes', ['Note No', 'Date', 'Party', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
    d.creditNotes.map(c => [c.number, c.date, c.party_name, c.gstin, c.taxable, c.cgst, c.sgst, c.igst, c.total]));

  csvBlock(lines, 'F. GSTR-3B Summary', ['Particulars', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
    [
      ['Outward supplies', gst.outward.taxable, gst.outward.cgst, gst.outward.sgst, gst.outward.igst, gst.outward.total],
      ['Less: Credit notes', gst.creditNotes.taxable, gst.creditNotes.cgst, gst.creditNotes.sgst, gst.creditNotes.igst, gst.creditNotes.total],
      ['Input Tax Credit (ITC)', gst.itc.taxable, gst.itc.cgst, gst.itc.sgst, gst.itc.igst, gst.itc.total],
      ['Net tax payable', '', '', '', '', gst.netTax],
    ]);

  const csv = '\uFEFF' + lines.map(r => r.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="GSTR1_${req.companyId}_${from}_${to}.csv"`);
  res.send(csv);
}));

router.get('/brs/banks', requireCap('brs'), wrap((req, res) => {
  const banks = req.db.prepare(`SELECT l.id, l.name, l.bank_name, l.account_no, l.ifsc, l.opening_balance, l.opening_type, g.name AS group_name
    FROM ledgers l JOIN groups g ON g.id = l.group_id
    WHERE g.name = 'Bank Accounts' AND l.is_active = 1 ORDER BY l.name`).all();
  res.json({ banks });
}));

router.get('/brs', requireCap('brs'), wrap((req, res) => {
  const ledgerId = Number(req.query.ledger_id);
  if (!ledgerId) return res.status(400).json({ error: 'Bank ledger select karo' });
  res.json(R.brs(req.db, ledgerId, asOn(req)));
}));

export default router;
