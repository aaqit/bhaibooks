import express from 'express';
import { authenticate, requireCap, requireCompany } from '../auth.js';
import { audit } from '../db.js';
import { wrap, httpError, str, numberOr } from './helpers.js';
import { groupTree } from '../lib/reports.js';

const router = express.Router();
router.use(authenticate, requireCompany);

router.get('/bootstrap', requireCap('master:read'), wrap((req, res) => {
  const db = req.db;
  const ledgers = db.prepare(`SELECT l.*, g.name AS group_name, g.category, g.nature
    FROM ledgers l JOIN groups g ON g.id = l.group_id WHERE l.is_active = 1 ORDER BY l.name`).all();
  const stockItems = db.prepare(`SELECT s.*, sg.name AS group_name, u.symbol AS unit, u.name AS unit_name
    FROM stock_items s LEFT JOIN stock_groups sg ON sg.id = s.stock_group_id
    LEFT JOIN units u ON u.id = s.unit_id WHERE s.is_active = 1 ORDER BY s.name`).all();
  const stockGroups = db.prepare('SELECT * FROM stock_groups ORDER BY name').all();
  const units = db.prepare('SELECT * FROM units ORDER BY name').all();
  const godowns = db.prepare('SELECT * FROM godowns ORDER BY is_default DESC, name').all();
  const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
  res.json({ company: req.company, groups: groupTree(db), ledgers, stockItems, stockGroups, units, godowns, settings });
}));

// ---------------------------------------------------------------------------
// Ledgers
// ---------------------------------------------------------------------------

router.get('/ledgers', requireCap('master:read'), wrap((req, res) => {
  const ledgers = req.db.prepare(`SELECT l.*, g.name AS group_name, g.category, g.nature
    FROM ledgers l JOIN groups g ON g.id=l.group_id ORDER BY l.name`).all();
  res.json({ ledgers });
}));

function ledgerValues(db, body, existing = {}) {
  const name = str(body.name ?? existing.name, 120);
  if (!name) throw httpError('Ledger name required');
  const groupId = Number(body.group_id ?? existing.group_id);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) throw httpError('Valid group select karo');
  const opening = numberOr(body.opening_balance ?? existing.opening_balance, 0);
  if (opening < 0) throw httpError('Opening balance negative nahi ho sakta');
  const openingType = (body.opening_type ?? existing.opening_type) === 'Cr' ? 'Cr' : 'Dr';
  const duplicate = db.prepare('SELECT id FROM ledgers WHERE lower(name) = lower(?) AND id <> ?').get(name, existing.id || 0);
  if (duplicate) throw httpError('Is naam ka ledger pehle se hai');

  return {
    name, group_id: groupId,
    opening_balance: opening, opening_type: openingType,
    gstin: str(body.gstin ?? existing.gstin, 20),
    gst_type: str(body.gst_type ?? existing.gst_type, 30) || 'Unregistered',
    state: str(body.state ?? existing.state, 80),
    phone: str(body.phone ?? existing.phone, 30),
    email: str(body.email ?? existing.email, 120),
    address: str(body.address ?? existing.address, 300),
    credit_limit: numberOr(body.credit_limit ?? existing.credit_limit, 0),
    credit_days: Math.round(numberOr(body.credit_days ?? existing.credit_days, 0)),
    bank_name: str(body.bank_name ?? existing.bank_name, 80),
    account_no: str(body.account_no ?? existing.account_no, 40),
    ifsc: str(body.ifsc ?? existing.ifsc, 20),
    upi: str(body.upi ?? existing.upi, 80),
    is_active: body.is_active === undefined ? (existing.is_active ?? 1) : (body.is_active ? 1 : 0),
  };
}

router.post('/ledgers', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const v = ledgerValues(db, req.body || {});
  const info = db.prepare(`INSERT INTO ledgers
    (name, group_id, opening_balance, opening_type, gstin, gst_type, state, phone, email, address,
     credit_limit, credit_days, bank_name, account_no, ifsc, upi, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    v.name, v.group_id, v.opening_balance, v.opening_type, v.gstin, v.gst_type, v.state, v.phone,
    v.email, v.address, v.credit_limit, v.credit_days, v.bank_name, v.account_no, v.ifsc, v.upi, v.is_active
  );
  audit({ companyId: req.companyId, user: req.user, action: 'LEDGER_CREATE', detail: v.name });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

router.put('/ledgers/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const existing = db.prepare('SELECT * FROM ledgers WHERE id = ?').get(Number(req.params.id));
  if (!existing) throw httpError('Ledger nahi mila', 404);
  const v = ledgerValues(db, req.body || {}, existing);
  db.prepare(`UPDATE ledgers SET name=?, group_id=?, opening_balance=?, opening_type=?, gstin=?, gst_type=?,
    state=?, phone=?, email=?, address=?, credit_limit=?, credit_days=?, bank_name=?, account_no=?, ifsc=?, upi=?, is_active=?
    WHERE id=?`).run(v.name, v.group_id, v.opening_balance, v.opening_type, v.gstin, v.gst_type, v.state, v.phone,
    v.email, v.address, v.credit_limit, v.credit_days, v.bank_name, v.account_no, v.ifsc, v.upi, v.is_active, existing.id);
  audit({ companyId: req.companyId, user: req.user, action: 'LEDGER_UPDATE', detail: v.name });
  res.json({ ok: true });
}));

router.delete('/ledgers/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const ledger = db.prepare('SELECT * FROM ledgers WHERE id = ?').get(Number(req.params.id));
  if (!ledger) throw httpError('Ledger nahi mila', 404);
  if (ledger.system_key) throw httpError('System ledger delete nahi ho sakta');
  const used = db.prepare('SELECT COUNT(*) c FROM voucher_entries WHERE ledger_id = ?').get(ledger.id).c;
  if (used) throw httpError('Is ledger me entries hain. Delete nahi kar sakte — inactive kar do.');
  db.prepare('DELETE FROM ledgers WHERE id = ?').run(ledger.id);
  audit({ companyId: req.companyId, user: req.user, action: 'LEDGER_DELETE', detail: ledger.name });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

router.get('/groups', requireCap('master:read'), wrap((req, res) => {
  res.json({ groups: groupTree(req.db), flat: req.db.prepare('SELECT * FROM groups ORDER BY name').all() });
}));

router.post('/groups', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const name = str(req.body?.name, 120);
  if (!name) throw httpError('Group name required');
  const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;
  let nature = 'ASSET', category = 'ASSET';
  if (parentId) {
    const parent = db.prepare('SELECT * FROM groups WHERE id = ?').get(parentId);
    if (!parent) throw httpError('Parent group nahi mila');
    nature = parent.nature;
    category = parent.category;
  } else {
    nature = str(req.body?.nature, 20).toUpperCase() || 'ASSET';
    category = str(req.body?.category, 30).toUpperCase() || nature;
  }
  try {
    const info = db.prepare('INSERT INTO groups (name, parent_id, nature, category, is_system) VALUES (?,?,?,?,0)')
      .run(name, parentId, nature, category);
    audit({ companyId: req.companyId, user: req.user, action: 'GROUP_CREATE', detail: name });
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch {
    throw httpError('Is parent ke andar same naam ka group hai');
  }
}));

router.delete('/groups/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(Number(req.params.id));
  if (!g) throw httpError('Group nahi mila', 404);
  if (g.is_system) throw httpError('System group delete nahi ho sakta');
  const kids = db.prepare('SELECT COUNT(*) c FROM groups WHERE parent_id = ?').get(g.id).c;
  const ledgers = db.prepare('SELECT COUNT(*) c FROM ledgers WHERE group_id = ?').get(g.id).c;
  if (kids || ledgers) throw httpError('Group ke andar sub-group ya ledger hai');
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  audit({ companyId: req.companyId, user: req.user, action: 'GROUP_DELETE', detail: g.name });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Godowns
// ---------------------------------------------------------------------------

router.post('/godowns', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const name = str(req.body?.name, 120);
  if (!name) throw httpError('Godown name required');
  const info = db.prepare('INSERT INTO godowns (name, address, is_default) VALUES (?,?,?)')
    .run(name, str(req.body?.address, 300), req.body?.is_default ? 1 : 0);
  if (req.body?.is_default) db.prepare('UPDATE godowns SET is_default = 0 WHERE id <> ?').run(Number(info.lastInsertRowid));
  audit({ companyId: req.companyId, user: req.user, action: 'GODOWN_CREATE', detail: name });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

router.put('/godowns/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const g = db.prepare('SELECT * FROM godowns WHERE id = ?').get(Number(req.params.id));
  if (!g) throw httpError('Godown nahi mila', 404);
  const name = str(req.body?.name ?? g.name, 120);
  const isDefault = req.body?.is_default === undefined ? g.is_default : (req.body.is_default ? 1 : 0);
  db.prepare('UPDATE godowns SET name=?, address=?, is_default=? WHERE id=?')
    .run(name, str(req.body?.address ?? g.address, 300), isDefault, g.id);
  if (isDefault) db.prepare('UPDATE godowns SET is_default = 0 WHERE id <> ?').run(g.id);
  audit({ companyId: req.companyId, user: req.user, action: 'GODOWN_UPDATE', detail: name });
  res.json({ ok: true });
}));

router.delete('/godowns/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const g = db.prepare('SELECT * FROM godowns WHERE id = ?').get(Number(req.params.id));
  if (!g) throw httpError('Godown nahi mila', 404);
  if (g.is_default) throw httpError('Default godown delete nahi ho sakta');
  const used = db.prepare('SELECT COUNT(*) c FROM voucher_items WHERE godown_id = ?').get(g.id).c;
  if (used) throw httpError('Godown use ho chuka hai. Delete nahi kar sakte.');
  db.prepare('DELETE FROM godowns WHERE id = ?').run(g.id);
  audit({ companyId: req.companyId, user: req.user, action: 'GODOWN_DELETE', detail: g.name });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Units & stock groups
// ---------------------------------------------------------------------------

router.post('/units', requireCap('masters'), wrap((req, res) => {
  const name = str(req.body?.name, 60);
  const symbol = str(req.body?.symbol, 12) || name;
  if (!name) throw httpError('Unit name required');
  const info = req.db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run(name, symbol);
  audit({ companyId: req.companyId, user: req.user, action: 'UNIT_CREATE', detail: name });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

router.post('/stock-groups', requireCap('masters'), wrap((req, res) => {
  const name = str(req.body?.name, 120);
  if (!name) throw httpError('Stock group name required');
  const info = req.db.prepare('INSERT INTO stock_groups (name, parent_id) VALUES (?,?)').run(name, req.body?.parent_id ? Number(req.body.parent_id) : null);
  audit({ companyId: req.companyId, user: req.user, action: 'STOCK_GROUP_CREATE', detail: name });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

// ---------------------------------------------------------------------------
// Stock items
// ---------------------------------------------------------------------------

function stockValues(db, body, existing = {}) {
  const name = str(body.name ?? existing.name, 150);
  if (!name) throw httpError('Item name required');
  const dup = db.prepare('SELECT id FROM stock_items WHERE lower(name)=lower(?) AND id<>?').get(name, existing.id || 0);
  if (dup) throw httpError('Is naam ka item pehle se hai');
  const unitId = Number(body.unit_id ?? existing.unit_id);
  if (!db.prepare('SELECT id FROM units WHERE id=?').get(unitId)) throw httpError('Unit select karo');
  const groupId = body.stock_group_id ?? existing.stock_group_id;
  if (groupId && !db.prepare('SELECT id FROM stock_groups WHERE id=?').get(Number(groupId))) throw httpError('Stock group valid nahi');
  const gstRate = numberOr(body.gst_rate ?? existing.gst_rate, 0);
  if (gstRate < 0 || gstRate > 28) throw httpError('GST rate 0-28 ke beech hona chahiye');
  return {
    name,
    stock_group_id: groupId ? Number(groupId) : null,
    unit_id: unitId,
    hsn: str(body.hsn ?? existing.hsn, 20),
    gst_rate: gstRate,
    sale_price: numberOr(body.sale_price ?? existing.sale_price, 0),
    purchase_price: numberOr(body.purchase_price ?? existing.purchase_price, 0),
    opening_qty: numberOr(body.opening_qty ?? existing.opening_qty, 0),
    opening_rate: numberOr(body.opening_rate ?? existing.opening_rate, 0),
    reorder_level: numberOr(body.reorder_level ?? existing.reorder_level, 0),
    batch_enabled: body.batch_enabled === undefined ? (existing.batch_enabled || 0) : (body.batch_enabled ? 1 : 0),
    is_active: body.is_active === undefined ? (existing.is_active ?? 1) : (body.is_active ? 1 : 0),
  };
}

router.post('/stock-items', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const v = stockValues(db, req.body || {});
  const info = db.prepare(`INSERT INTO stock_items
    (name, stock_group_id, unit_id, hsn, gst_rate, sale_price, purchase_price, opening_qty, opening_rate, reorder_level, batch_enabled, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(v.name, v.stock_group_id, v.unit_id, v.hsn, v.gst_rate,
    v.sale_price, v.purchase_price, v.opening_qty, v.opening_rate, v.reorder_level, v.batch_enabled, v.is_active);
  audit({ companyId: req.companyId, user: req.user, action: 'ITEM_CREATE', detail: v.name });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

router.put('/stock-items/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const existing = db.prepare('SELECT * FROM stock_items WHERE id=?').get(Number(req.params.id));
  if (!existing) throw httpError('Stock item nahi mila', 404);
  const v = stockValues(db, req.body || {}, existing);
  db.prepare(`UPDATE stock_items SET name=?, stock_group_id=?, unit_id=?, hsn=?, gst_rate=?, sale_price=?,
    purchase_price=?, opening_qty=?, opening_rate=?, reorder_level=?, batch_enabled=?, is_active=? WHERE id=?`)
    .run(v.name, v.stock_group_id, v.unit_id, v.hsn, v.gst_rate, v.sale_price, v.purchase_price,
      v.opening_qty, v.opening_rate, v.reorder_level, v.batch_enabled, v.is_active, existing.id);
  audit({ companyId: req.companyId, user: req.user, action: 'ITEM_UPDATE', detail: v.name });
  res.json({ ok: true });
}));

router.delete('/stock-items/:id', requireCap('masters'), wrap((req, res) => {
  const db = req.db;
  const item = db.prepare('SELECT * FROM stock_items WHERE id=?').get(Number(req.params.id));
  if (!item) throw httpError('Stock item nahi mila', 404);
  const used = db.prepare('SELECT COUNT(*) c FROM voucher_items WHERE stock_item_id=?').get(item.id).c;
  if (used) throw httpError('Item vouchers me use ho chuka hai. Delete nahi kar sakte — inactive kar do.');
  db.prepare('DELETE FROM stock_items WHERE id=?').run(item.id);
  audit({ companyId: req.companyId, user: req.user, action: 'ITEM_DELETE', detail: item.name });
  res.json({ ok: true });
}));

export default router;
