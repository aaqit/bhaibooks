import express from 'express';
import { authenticate, loginRateLimit, recordLoginFailure, clearLoginFailures, checkPassword, signToken, sessionPayload, isLocalRequest } from '../auth.js';
import { getMasterDb, getUserByUsername, hashPassword, audit, publicUser } from '../db.js';
import { wrap, httpError, str } from './helpers.js';

const router = express.Router();

router.post('/login', loginRateLimit, wrap((req, res) => {
  const username = str(req.body?.username, 80);
  const password = String(req.body?.password || '');
  if (!username || !password) throw httpError('Username aur password dono chahiye', 400);

  const user = getUserByUsername(username);
  if (!user || !user.active || !checkPassword(password, user.password_hash)) {
    recordLoginFailure(req);
    throw httpError('Username ya password galat hai', 401, 'INVALID_CREDENTIALS');
  }
  clearLoginFailures(req);
  const mode = isLocalRequest(req) ? 'desktop' : 'web';
  const token = signToken(user);
  audit({ user, action: 'LOGIN', detail: `Login mode: ${mode}` });
  res.json({ token, ...sessionPayload(user, mode) });
}));

router.get('/me', authenticate, wrap((req, res) => {
  res.json(sessionPayload(req.user, req.mode));
}));

router.post('/change-password', authenticate, wrap((req, res) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  if (!checkPassword(current, req.user.password_hash)) throw httpError('Current password galat hai', 400);
  if (next.length < 6) throw httpError('New password kam se kam 6 characters ka ho', 400);
  getMasterDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  audit({ user: req.user, action: 'PASSWORD_CHANGE', detail: 'Self password changed' });
  res.json({ ok: true, message: 'Password update ho gaya' });
}));

router.get('/users-lite', authenticate, wrap((req, res) => {
  // Only used by the desktop settings screen for a lightweight display.
  const users = getMasterDb().prepare('SELECT id, username, full_name, role, active FROM users ORDER BY id').all();
  res.json({ users: users.map(publicUser) });
}));

export default router;
