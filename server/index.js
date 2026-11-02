import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ROOT, DATA_DIR, ensureMasterSeed, getMasterDb, listCompaniesForUser, backupCompany } from './db.js';
import authRoutes from './routes/auth.routes.js';
import companyRoutes from './routes/company.routes.js';
import masterRoutes from './routes/masters.routes.js';
import voucherRoutes from './routes/vouchers.routes.js';
import reportRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';

ensureMasterSeed();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'BahiBooks ERP', time: new Date().toISOString(), mode: req.socket.remoteAddress });
});

app.use('/api/auth', authRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', companyRoutes);
app.use('/api', voucherRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` }));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
      else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.type('html').send(`<!doctype html><html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:40px">
      <h1>BahiBooks ERP API running</h1>
      <p>Client build nahi mila. Dev ke liye: <code>npm run dev</code> — phir http://localhost:5173 kholo.</p>
      <p>Production ke liye: <code>npm run build</code> phir <code>npm start</code>.</p>
      <p>API health: <a style="color:#fbbf24" href="/api/health">/api/health</a></p>
    </body></html>`);
  });
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message || 'Server error';
  if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
    status = 400;
    if (message.includes('UNIQUE')) message = 'Ye record pehle se exist karta hai';
    else if (message.includes('FOREIGN KEY')) message = 'Record kisi aur data se linked hai';
    else message = 'Database constraint error: ' + message;
  }
  if (status >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err);
  res.status(status).json({ error: message, code: err.code || undefined });
});

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(`http://${net.address}:${PORT}`);
    }
  }
  return out;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║            BahiBooks ERP v1.0.0                  ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log(`  PC Desktop mode : http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  Web / Mobile    : ${url}  (limited access)`);
  console.log(`  Data folder     : ${DATA_DIR}`);
  console.log(`  Mode            : ${process.env.ACCESS_MODE || 'auto (localhost = full desktop, network = web entry)'}`);
  console.log('');
  console.log('  Demo logins: admin/admin123, owner/owner123, manager/manager123,');
  console.log('               operator/operator123, auditor/auditor123');
  console.log('');
});

// Lightweight automatic backup: every 12 hours, newest 10 kept per company.
const backupTimer = setInterval(() => {
  try {
    const admin = getMasterDb().prepare("SELECT * FROM users WHERE role='super_admin' LIMIT 1").get();
    for (const company of listCompaniesForUser(admin)) {
      try { backupCompany(company.id); } catch (err) { console.error('Auto backup failed:', company.id, err.message); }
    }
  } catch (err) { console.error('Auto backup error:', err.message); }
}, 12 * 60 * 60 * 1000);
backupTimer.unref();

export default app;
