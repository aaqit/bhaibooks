import express from 'express';
import { authenticate, requireCap, requireCompany } from '../auth.js';
import { audit } from '../db.js';
import { saveVoucher, deleteVoucher, getVoucherFull, VOUCHER_TYPES, today } from '../lib/accounting.js';
import { wrap, httpError, requireAnyCap, isDateStr, str } from './helpers.js';

const router = express.Router();
router.use(authenticate, requireCompany);

router.get('/voucher-types', wrap((req, res) => {
  res.json({ types: Object.entries(VOUCHER_TYPES).map(([type, cfg]) => ({ type, ...cfg })) });
}));

router.get('/vouchers', requireAnyCap('daybook', 'reports', 'reports:financial'), wrap((req, res) => {
  const db = req.db;
  const from = isDateStr(req.query.from) ? req.query.from : '1900-01-01';
  const to = isDateStr(req.query.to) ? req.query.to : '2999-12-31';
  const type = str(req.query.type, 20).toUpperCase();
  const q = str(req.query.q, 100);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

  const where = ['date(v.date) BETWEEN date(?) AND date(?)'];
  const params = [from, to];
  if (type && VOUCHER_TYPES[type]) { where.push('v.type = ?'); params.push(type); }
  if (q) { where.push('(v.number LIKE ? OR v.narration LIKE ? OR p.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  params.push(limit);

  const list = db.prepare(`SELECT v.*, COALESCE(p.name, fl.name, tl.name) AS account_name,
      p.name AS party_name, fl.name AS from_name, tl.name AS to_name,
      (SELECT COUNT(*) FROM voucher_items i WHERE i.voucher_id=v.id) AS item_count
    FROM vouchers v
    LEFT JOIN ledgers p ON p.id=v.party_ledger_id
    LEFT JOIN ledgers fl ON fl.id=v.from_ledger_id
    LEFT JOIN ledgers tl ON tl.id=v.to_ledger_id
    WHERE ${where.join(' AND ')}
    ORDER BY v.date DESC, v.id DESC LIMIT ?`).all(...params);
  res.json({ vouchers: list, from, to });
}));

router.get('/vouchers/:id', requireAnyCap('voucher:create', 'daybook', 'reports', 'reports:financial'), wrap((req, res) => {
  res.json({ voucher: getVoucherFull(req.db, req.params.id) });
}));

router.post('/vouchers', requireCap('voucher:create'), wrap((req, res) => {
  const payload = req.body || {};
  if (!payload.type) throw httpError('Voucher type required');
  const result = saveVoucher(req.db, req.company, payload, req.user);
  audit({
    companyId: req.companyId, user: req.user, action: 'VOUCHER_CREATE',
    detail: `${result.number} (${payload.type}) ₹${result.total}`,
  });
  const voucher = getVoucherFull(req.db, result.id);
  res.status(201).json({ ok: true, voucher, message: `${voucher.number} save ho gaya` });
}));

router.put('/vouchers/:id', requireCap('voucher:create'), wrap((req, res) => {
  const db = req.db;
  const existing = db.prepare('SELECT * FROM vouchers WHERE id=?').get(Number(req.params.id));
  if (!existing) throw httpError('Voucher nahi mila', 404);
  if (req.user.role === 'operator' && existing.date !== today()) {
    throw httpError('Operator sirf aaj ke voucher edit kar sakta hai', 403);
  }
  if (req.body?.type && String(req.body.type).toUpperCase() !== existing.type) throw httpError('Voucher type change nahi ho sakta');
  const payload = { ...req.body, type: existing.type };
  saveVoucher(db, req.company, payload, req.user, existing);
  audit({ companyId: req.companyId, user: req.user, action: 'VOUCHER_UPDATE', detail: `${existing.number}` });
  res.json({ ok: true, voucher: getVoucherFull(db, existing.id), message: 'Voucher update ho gaya' });
}));

router.delete('/vouchers/:id', requireCap('voucher:delete'), wrap((req, res) => {
  const v = deleteVoucher(req.db, Number(req.params.id), req.user);
  audit({ companyId: req.companyId, user: req.user, action: 'VOUCHER_DELETE', detail: `${v.number} (${v.type}) ₹${v.total}` });
  res.json({ ok: true, message: `${v.number} delete ho gaya` });
}));

router.post('/vouchers/:id/reconcile', requireCap('brs'), wrap((req, res) => {
  const db = req.db;
  const voucherId = Number(req.params.id);
  const ledgerId = Number(req.body?.ledger_id);
  const entry = db.prepare('SELECT * FROM voucher_entries WHERE voucher_id=? AND ledger_id=?').get(voucherId, ledgerId);
  if (!entry) throw httpError('Bank entry nahi mili', 404);
  db.prepare(`INSERT INTO brs_entries (voucher_id, ledger_id, reconciled, bank_date, note)
    VALUES (?,?,?,?,?)
    ON CONFLICT(voucher_id, ledger_id) DO UPDATE SET reconciled=excluded.reconciled, bank_date=excluded.bank_date, note=excluded.note`)
    .run(voucherId, ledgerId, req.body?.reconciled ? 1 : 0, str(req.body?.bank_date, 10), str(req.body?.note, 200));
  audit({ companyId: req.companyId, user: req.user, action: 'BRS_RECONCILE', detail: `Voucher ${voucherId} / ledger ${ledgerId}: ${req.body?.reconciled ? 'cleared' : 'uncleared'}` });
  res.json({ ok: true });
}));

export default router;
