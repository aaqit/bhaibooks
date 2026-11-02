import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authenticate, requireCap, requireCompany, hasCap, checkPassword, markCompanyUnlocked, lockCompanyVault } from '../auth.js';
import { getMasterDb, getCompanyDb, createCompany, listCompaniesForUser, canAccessCompany, backupCompany, audit, hashPassword, BACKUP_DIR } from '../db.js';
import { wrap, httpError, str } from './helpers.js';

const router = express.Router();

router.get('/companies', authenticate, wrap((req, res) => {
  const companies = listCompaniesForUser(req.user).map(c => ({
    ...c, locked: !!c.password_hash, password_hash: undefined,
  }));
  res.json({ companies, capabilities: req.capabilities, mode: req.mode });
}));

// --- Company security vault: folder-wise password ---
router.post('/companies/:id/password', authenticate, requireCap('settings'), wrap((req, res) => {
  const id = String(req.params.id);
  const master = getMasterDb();
  const company = master.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  if (!company) throw httpError('Company nahi mili', 404);
  if (!canAccessCompany(req.user, id)) throw httpError('Is company ka access aapko nahi hai', 403);

  const password = String(req.body?.password || '');
  const current = String(req.body?.current_password || '');
  if (company.password_hash && !checkPassword(current, company.password_hash) && req.user.role !== 'super_admin') {
    throw httpError('Purana company password galat hai', 400);
  }
  if (password && password.length < 4) throw httpError('Company password kam se kam 4 character ka ho');

  master.prepare('UPDATE companies SET password_hash = ? WHERE id = ?').run(password ? hashPassword(password) : '', id);
  if (password) markCompanyUnlocked(req.user.id, id); else lockCompanyVault(req.user.id, id);
  audit({ companyId: id, user: req.user, action: 'COMPANY_VAULT', detail: password ? 'Vault password set' : 'Vault password removed' });
  res.json({ ok: true, locked: !!password, message: password ? 'Company vault lock ho gaya' : 'Company vault password hata diya' });
}));

router.post('/companies/:id/unlock', authenticate, wrap((req, res) => {
  const id = String(req.params.id);
  const master = getMasterDb();
  const company = master.prepare('SELECT id, name, password_hash FROM companies WHERE id = ?').get(id);
  if (!company) throw httpError('Company nahi mili', 404);
  if (!canAccessCompany(req.user, id)) throw httpError('Is company ka access aapko nahi hai', 403);
  if (company.password_hash && req.user.role !== 'super_admin' && !checkPassword(req.body?.password, company.password_hash)) {
    audit({ companyId: id, user: req.user, action: 'COMPANY_UNLOCK_FAIL', detail: 'Wrong vault password' });
    throw httpError('Company password galat hai', 401);
  }
  markCompanyUnlocked(req.user.id, id);
  audit({ companyId: id, user: req.user, action: 'COMPANY_UNLOCK', detail: company.name });
  res.json({ ok: true, message: 'Vault unlock ho gaya' });
}));

router.post('/companies/:id/lock', authenticate, wrap((req, res) => {
  lockCompanyVault(req.user.id, String(req.params.id));
  res.json({ ok: true, message: 'Vault lock kar diya' });
}));

router.post('/companies', authenticate, requireCap('settings'), wrap((req, res) => {
  const company = createCompany({
    name: str(req.body?.name, 120),
    financial_year: str(req.body?.financial_year, 20) || '2026-2027',
    books_from: str(req.body?.books_from, 10) || '2026-04-01',
    currency: str(req.body?.currency, 8) || 'INR',
    gstin: str(req.body?.gstin, 20),
    pan: str(req.body?.pan, 20),
    address: str(req.body?.address, 300),
    city: str(req.body?.city, 80),
    state: str(req.body?.state, 80),
    pincode: str(req.body?.pincode, 10),
    phone: str(req.body?.phone, 30),
    email: str(req.body?.email, 120),
  }, req.user, { demo: !!req.body?.seed_demo });
  res.json({ ok: true, company });
}));

router.patch('/companies/:id', authenticate, requireCap('settings'), wrap((req, res) => {
  const master = getMasterDb();
  const existing = master.prepare('SELECT * FROM companies WHERE id = ?').get(String(req.params.id));
  if (!existing) throw httpError('Company nahi mili', 404);

  const next = {
    name: str(req.body?.name ?? existing.name, 120),
    financial_year: str(req.body?.financial_year ?? existing.financial_year, 20),
    books_from: str(req.body?.books_from ?? existing.books_from, 10),
    currency: str(req.body?.currency ?? existing.currency, 8),
    gstin: str(req.body?.gstin ?? existing.gstin, 20),
    pan: str(req.body?.pan ?? existing.pan, 20),
    address: str(req.body?.address ?? existing.address, 300),
    city: str(req.body?.city ?? existing.city, 80),
    state: str(req.body?.state ?? existing.state, 80),
    pincode: str(req.body?.pincode ?? existing.pincode, 10),
    phone: str(req.body?.phone ?? existing.phone, 30),
    email: str(req.body?.email ?? existing.email, 120),
  };
  if (!next.name) throw httpError('Company name required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.books_from)) throw httpError('Books beginning YYYY-MM-DD format me ho');

  master.prepare(`UPDATE companies SET name=?, financial_year=?, books_from=?, currency=?, gstin=?, pan=?,
    address=?, city=?, state=?, pincode=?, phone=?, email=? WHERE id=?`).run(
    next.name, next.financial_year, next.books_from, next.currency, next.gstin, next.pan,
    next.address, next.city, next.state, next.pincode, next.phone, next.email, existing.id
  );

  try {
    const { db } = getCompanyDb(existing.id);
    const put = (key, value) => db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(key, String(value));
    put('books_from', next.books_from);
    put('financial_year', next.financial_year);
    put('company_state', next.state);
  } catch (err) {
    console.error('Company settings sync failed:', err.message);
  }

  audit({ companyId: existing.id, user: req.user, action: 'COMPANY_UPDATE', detail: next.name });
  const company = master.prepare('SELECT * FROM companies WHERE id = ?').get(existing.id);
  res.json({ ok: true, company, message: 'Company profile update ho gayi' });
}));

router.get('/company/meta', authenticate, requireCompany, wrap((req, res) => {
  const { db, company } = req;
  const count = (sql) => db.prepare(sql).get()?.c || 0;
  res.json({
    company,
    counts: {
      ledgers: count('SELECT COUNT(*) c FROM ledgers WHERE is_active=1'),
      vouchers: count('SELECT COUNT(*) c FROM vouchers'),
      items: count('SELECT COUNT(*) c FROM stock_items WHERE is_active=1'),
      customers: db.prepare("SELECT COUNT(*) c FROM ledgers l JOIN groups g ON g.id=l.group_id WHERE g.name='Sundry Debtors' AND l.is_active=1").get()?.c || 0,
      suppliers: db.prepare("SELECT COUNT(*) c FROM ledgers l JOIN groups g ON g.id=l.group_id WHERE g.name='Sundry Creditors' AND l.is_active=1").get()?.c || 0,
    },
    mode: req.mode,
    canBackup: hasCap(req.user, req.mode, 'backup'),
  });
}));

router.post('/company/backup', authenticate, requireCompany, requireCap('backup'), wrap((req, res) => {
  const dest = backupCompany(req.companyId);
  audit({ companyId: req.companyId, user: req.user, action: 'BACKUP', detail: `Backup created ${path.basename(dest)}` });
  res.json({ ok: true, file: path.basename(dest), message: 'Backup ban gaya' });
}));

router.get('/company/backup/download', authenticate, requireCompany, requireCap('backup'), wrap((req, res) => {
  const dest = backupCompany(req.companyId);
  audit({ companyId: req.companyId, user: req.user, action: 'BACKUP_DOWNLOAD', detail: path.basename(dest) });
  res.download(dest, path.basename(dest));
}));

router.get('/company/backups', authenticate, requireCompany, requireCap('backup'), wrap((req, res) => {
  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`${req.companyId}-`)).sort().reverse().slice(0, 20)
    : [];
  res.json({
    backups: files.map(name => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, created_at: stat.mtime.toISOString() };
    }),
  });
}));

router.get('/company/settings', authenticate, requireCompany, wrap((req, res) => {
  const rows = req.db.prepare('SELECT key, value FROM settings').all();
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
}));

router.post('/company/settings/lock-date', authenticate, requireCompany, requireCap('settings'), wrap((req, res) => {
  const lockDate = str(req.body?.lock_date, 10);
  if (lockDate && !/^\d{4}-\d{2}-\d{2}$/.test(lockDate)) throw httpError('Lock date YYYY-MM-DD format me ho');
  req.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lock_date', ?)").run(lockDate);
  audit({ companyId: req.companyId, user: req.user, action: 'PERIOD_LOCK', detail: lockDate ? `Locked till ${lockDate}` : 'Lock removed' });
  res.json({ ok: true, message: lockDate ? `Books ${lockDate} tak lock ho gayi` : 'Period lock remove ho gaya' });
}));

// Company-level settings (valuation method, expiry alert, credit enforcement).
const COMPANY_SETTING_KEYS = ['stock_valuation', 'expiry_alert_days', 'credit_enforce', 'company_state'];

router.post('/company/settings', authenticate, requireCompany, requireCap('settings'), wrap((req, res) => {
  const body = req.body || {};
  const put = req.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
  const applied = {};
  for (const key of COMPANY_SETTING_KEYS) {
    if (body[key] === undefined) continue;
    let value = String(body[key]);
    if (key === 'stock_valuation') {
      value = value.toUpperCase();
      if (!['AVERAGE', 'FIFO', 'LPP'].includes(value)) throw httpError('Valuation AVERAGE / FIFO / LPP me se select karo');
    } else if (key === 'expiry_alert_days') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 365) throw httpError('Expiry alert days 0 se 365 ke beech ho');
      value = String(Math.round(n));
    } else if (key === 'credit_enforce') {
      value = (value === 'true' || value === '1') ? '1' : '0';
    }
    put.run(key, value);
    applied[key] = value;
  }
  audit({ companyId: req.companyId, user: req.user, action: 'COMPANY_SETTINGS', detail: JSON.stringify(applied) });
  res.json({ ok: true, settings: applied, message: 'Settings save ho gayi' });
}));

export default router;
