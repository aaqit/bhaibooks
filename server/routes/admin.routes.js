import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { authenticate, requireCap, requireCompany, ROLE_CAPS, ROLE_LABELS } from '../auth.js';
import { getMasterDb, hashPassword, audit, publicUser, DATA_DIR, COMPANIES_DIR } from '../db.js';
import { wrap, httpError, str } from './helpers.js';

const router = express.Router();
router.use(authenticate, requireCompany);

router.get('/users', requireCap('users'), wrap((req, res) => {
  const users = getMasterDb().prepare('SELECT * FROM users ORDER BY id').all()
    .map(u => ({ ...publicUser(u), scope: u.company_scope === 'ALL' ? 'ALL' : JSON.parse(u.company_scope || '[]') }));
  const companies = getMasterDb().prepare('SELECT id, name FROM companies ORDER BY name').all();
  res.json({ users, companies, roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })), caps: ROLE_CAPS });
}));

function parseScope(raw, role) {
  if (role === 'super_admin') return 'ALL';
  if (!raw || raw === 'ALL') return 'ALL';
  if (Array.isArray(raw)) {
    const ids = raw.map(String);
    const valid = getMasterDb().prepare('SELECT id FROM companies').all().map(c => c.id);
    for (const id of ids) if (!valid.includes(id)) throw httpError('Invalid company selected');
    return JSON.stringify(ids);
  }
  throw httpError('Invalid company scope');
}

router.post('/users', requireCap('users'), wrap((req, res) => {
  const db = getMasterDb();
  const username = str(req.body?.username, 40).toLowerCase();
  const fullName = str(req.body?.full_name, 100);
  const password = String(req.body?.password || '');
  const role = str(req.body?.role, 30) || 'operator';
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw httpError('Username 3-40 characters (a-z, 0-9, . _ -)');
  if (!fullName) throw httpError('Full name required');
  if (password.length < 6) throw httpError('Password kam se kam 6 characters');
  if (!ROLE_CAPS[role]) throw httpError('Invalid role');
  if (db.prepare('SELECT id FROM users WHERE lower(username)=?').get(username)) throw httpError('Username already exists');
  const scope = parseScope(req.body?.company_scope, role);
  const info = db.prepare('INSERT INTO users (username, password_hash, full_name, role, company_scope) VALUES (?,?,?,?,?)')
    .run(username, hashPassword(password), fullName, role, scope);
  audit({ companyId: req.companyId, user: req.user, action: 'USER_CREATE', detail: `${username} (${role})` });
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
}));

router.patch('/users/:id', requireCap('users'), wrap((req, res) => {
  const db = getMasterDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id));
  if (!user) throw httpError('User nahi mila', 404);
  if (user.id === req.user.id && req.body?.active === false) throw httpError('Apne aap ko deactivate nahi kar sakte');

  const role = req.body?.role ? str(req.body.role, 30) : user.role;
  if (!ROLE_CAPS[role]) throw httpError('Invalid role');
  if (user.role === 'super_admin' && role !== 'super_admin') {
    const supers = db.prepare("SELECT COUNT(*) c FROM users WHERE role='super_admin' AND active=1").get().c;
    if (supers <= 1) throw httpError('Last super admin ka role change nahi ho sakta');
  }
  const fullName = str(req.body?.full_name ?? user.full_name, 100);
  const active = req.body?.active === undefined ? user.active : (req.body.active ? 1 : 0);
  const scope = req.body?.company_scope === undefined ? user.company_scope : parseScope(req.body.company_scope, role);
  db.prepare('UPDATE users SET full_name=?, role=?, active=?, company_scope=? WHERE id=?')
    .run(fullName, role, active, scope, user.id);
  if (req.body?.password) {
    if (String(req.body.password).length < 6) throw httpError('Password kam se kam 6 characters');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(req.body.password), user.id);
  }
  audit({ companyId: req.companyId, user: req.user, action: 'USER_UPDATE', detail: `${user.username} (${role})` });
  res.json({ ok: true });
}));

router.get('/audit', requireCap('audit'), wrap((req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  const list = getMasterDb().prepare(`SELECT * FROM audit WHERE company_id = ? OR company_id IS NULL ORDER BY id DESC LIMIT ?`)
    .all(req.companyId, limit);
  res.json({ audit: list });
}));

router.get('/system', requireCap('users'), wrap((req, res) => {
  const dbPath = path.join(COMPANIES_DIR, req.companyId, 'company.db');
  let size = 0;
  try { size = fs.statSync(dbPath).size; } catch {}
  res.json({
    app: 'BahiBooks ERP',
    version: '1.0.0',
    mode: req.mode,
    node: process.version,
    platform: process.platform,
    data_dir: DATA_DIR,
    company_folder: path.dirname(dbPath),
    company_db_size: size,
    desktop_launcher: 'start-desktop.bat',
  });
}));

export default router;
