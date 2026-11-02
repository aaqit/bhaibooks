import { hasCap } from '../auth.js';

export function wrap(fn) {
  return (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) { next(err); }
  };
}

export function httpError(message, status = 400, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

export function requireAnyCap(...caps) {
  return (req, res, next) => {
    if (caps.some(c => hasCap(req.user, req.mode, c))) return next();
    const desktopPossible = caps.some(c => hasCap(req.user, 'desktop', c));
    return res.status(403).json({
      error: req.mode === 'web' && desktopPossible
        ? 'Ye feature sirf PC Desktop app me available hai.'
        : 'Aapke role ke paas is feature ki permission nahi hai.',
      code: req.mode === 'web' && desktopPossible ? 'DESKTOP_ONLY' : 'FORBIDDEN',
      capabilities: req.capabilities,
    });
  };
}

export function isDateStr(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function dateRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  let from = isDateStr(req.query.from) ? req.query.from : `${today.slice(0, 8)}01`;
  let to = isDateStr(req.query.to) ? req.query.to : today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function asOn(req) {
  const today = new Date().toISOString().slice(0, 10);
  return isDateStr(req.query.as_on) ? req.query.as_on : today;
}

export function pick(body, keys, fallback = {}) {
  const out = { ...fallback };
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export function str(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
