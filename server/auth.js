import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DATA_DIR, getUserById, getUserByUsername, listCompaniesForUser, canAccessCompany, getCompanyDb, getMasterDb, publicUser } from './db.js';

const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

const SECRET = getSecret();

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  owner: 'Shop Owner / Admin',
  manager: 'Branch Manager / Accountant',
  operator: 'Data Entry Operator',
  auditor: 'CA Auditor (Read only)',
};

const ALL_CAPS = [
  'dashboard', 'master:read', 'masters', 'voucher:create', 'voucher:delete', 'daybook',
  'reports', 'reports:financial', 'stock', 'brs', 'gst', 'settings', 'backup', 'users', 'audit',
];

export const ROLE_CAPS = {
  super_admin: ALL_CAPS,
  owner: ['dashboard', 'master:read', 'masters', 'voucher:create', 'voucher:delete', 'daybook', 'reports', 'reports:financial', 'stock', 'brs', 'gst', 'settings', 'backup', 'audit'],
  manager: ['dashboard', 'master:read', 'masters', 'voucher:create', 'voucher:delete', 'daybook', 'reports', 'reports:financial', 'stock', 'brs', 'gst', 'audit'],
  operator: ['dashboard', 'master:read', 'voucher:create', 'daybook', 'stock'],
  auditor: ['dashboard', 'master:read', 'daybook', 'reports', 'reports:financial', 'stock', 'brs', 'gst', 'audit'],
};

const WEB_BASE = ['dashboard', 'master:read'];
const WEB_ENTRY_ROLES = new Set(['super_admin', 'owner', 'manager', 'operator']);

// Online (web) par bhi poora ERP chalane ke liye: WEB_FULL_ACCESS=true ya ACCESS_MODE=full.
export function webFullAccess() {
  return process.env.WEB_FULL_ACCESS === 'true' || process.env.ACCESS_MODE === 'full';
}

export function isLocalRequest(req) {
  if (process.env.ACCESS_MODE === 'web') return false;
  if (process.env.ACCESS_MODE === 'desktop') return true;
  const ip = req.socket?.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function capabilitiesFor(user, mode) {
  if (!user) return [];
  if (mode === 'web' && !webFullAccess()) {
    return WEB_ENTRY_ROLES.has(user.role) ? [...WEB_BASE, 'voucher:create'] : [...WEB_BASE];
  }
  return user.role === 'super_admin' ? [...ALL_CAPS] : (ROLE_CAPS[user.role] || []);
}

export function hasCap(user, mode, cap) {
  return capabilitiesFor(user, mode).includes(cap);
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username }, SECRET, { expiresIn: '12h' });
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Login required', code: 'AUTH_REQUIRED' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = getUserById(payload.uid);
    if (!user || !user.active) return res.status(401).json({ error: 'Session expired. Dobara login karo.', code: 'AUTH_REQUIRED' });
    req.user = user;
    req.mode = (isLocalRequest(req) || webFullAccess()) ? 'desktop' : 'web';
    req.capabilities = capabilitiesFor(user, req.mode);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Dobara login karo.', code: 'AUTH_REQUIRED' });
  }
}

export function requireCap(cap) {
  return (req, res, next) => {
    if (hasCap(req.user, req.mode, cap)) return next();
    const webBlocked = req.mode === 'web' && !hasCap(req.user, 'desktop', cap);
    return res.status(403).json({
      error: webBlocked
        ? 'Ye feature sirf PC Desktop app me available hai. Web par Dashboard aur Voucher Entry hi allowed hai.'
        : 'Aapke role ke paas is feature ki permission nahi hai.',
      code: webBlocked ? 'DESKTOP_ONLY' : 'FORBIDDEN',
      capabilities: req.capabilities,
    });
  };
}

// --- Company security vault (per-company folder password) ---
const unlockedCompanies = new Map();
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

export function markCompanyUnlocked(userId, companyId) {
  unlockedCompanies.set(`${userId}:${companyId}`, Date.now() + UNLOCK_TTL_MS);
}

export function lockCompanyVault(userId, companyId) {
  unlockedCompanies.delete(`${userId}:${companyId}`);
}

function isCompanyUnlocked(userId, companyId) {
  const key = `${userId}:${companyId}`;
  const till = unlockedCompanies.get(key);
  if (!till) return false;
  if (till < Date.now()) { unlockedCompanies.delete(key); return false; }
  return true;
}

export function requireCompany(req, res, next) {
  const companyId = req.headers['x-company-id'] || req.query.company_id;
  if (!companyId) return res.status(400).json({ error: 'Company select karo', code: 'NO_COMPANY' });
  if (!canAccessCompany(req.user, String(companyId))) {
    return res.status(403).json({ error: 'Is company ka access aapko nahi hai', code: 'COMPANY_FORBIDDEN' });
  }
  const vault = getMasterDb().prepare('SELECT password_hash FROM companies WHERE id = ?').get(String(companyId));
  if (vault?.password_hash && req.user.role !== 'super_admin' && !isCompanyUnlocked(req.user.id, String(companyId))) {
    return res.status(403).json({
      error: 'Ye company vault se lock hai. Company password daalo.',
      code: 'COMPANY_LOCKED',
      company_id: String(companyId),
    });
  }
  try {
    const { db, company } = getCompanyDb(String(companyId));
    req.db = db;
    req.company = company;
    req.companyId = company.id;
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

export function loginRateLimit(req, res, next) {
  const key = `${req.ip}|${String(req.body?.username || '').toLowerCase()}`;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.blockedUntil > now) {
    return res.status(429).json({ error: 'Bahut zyada login attempts. 10 minute baad try karo.' });
  }
  if (rec && now - rec.first > WINDOW_MS) attempts.delete(key);
  next();
}

export function recordLoginFailure(req) {
  const key = `${req.ip}|${String(req.body?.username || '').toLowerCase()}`;
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, first: now, blockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.blockedUntil = now + WINDOW_MS;
  attempts.set(key, rec);
}

export function clearLoginFailures(req) {
  attempts.delete(`${req.ip}|${String(req.body?.username || '').toLowerCase()}`);
}

export function checkPassword(plain, hash) {
  return bcrypt.compareSync(String(plain || ''), String(hash || ''));
}

export function sessionPayload(user, mode) {
  return {
    user: publicUser(user),
    roleLabel: ROLE_LABELS[user.role] || user.role,
    companies: listCompaniesForUser(user),
    mode,
    capabilities: capabilitiesFor(user, mode),
  };
}

export function authRouterHelpers() { return { SECRET }; }
