import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { saveVoucher } from './lib/accounting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.BAHI_DATA_DIR ? path.resolve(process.env.BAHI_DATA_DIR) : path.join(ROOT, 'data');
export const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(COMPANIES_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Purane database me naya column add karne ke liye (idempotent migration).
export function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

const companyCache = new Map();
let masterDb = null;

export function getMasterDb() {
  if (masterDb) return masterDb;
  masterDb = new DatabaseSync(path.join(DATA_DIR, 'master.db'));
  masterDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      company_scope TEXT NOT NULL DEFAULT 'ALL',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      financial_year TEXT NOT NULL,
      books_from TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      gstin TEXT DEFAULT '',
      pan TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT 'Gujarat',
      pincode TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id TEXT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_company ON audit(company_id, id);
  `);
  // Company security vault (per-folder password) — purane DB me bhi add ho jaye.
  ensureColumn(masterDb, 'companies', 'password_hash', "TEXT NOT NULL DEFAULT ''");
  return masterDb;
}

export function audit({ companyId = null, user = null, action, detail = '' }) {
  try {
    getMasterDb().prepare('INSERT INTO audit (company_id, user_id, username, action, detail) VALUES (?,?,?,?,?)')
      .run(companyId, user?.id || null, user?.username || 'system', action, typeof detail === 'string' ? detail : JSON.stringify(detail));
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), 10);
}

export function companyScopeOf(user) {
  if (!user) return [];
  if (user.role === 'super_admin' || user.company_scope === 'ALL') return null; // null = all
  try {
    const arr = JSON.parse(user.company_scope);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function listCompaniesForUser(user) {
  const all = getMasterDb().prepare('SELECT * FROM companies ORDER BY id').all();
  const scope = companyScopeOf(user);
  if (!scope) return all;
  return all.filter(c => scope.includes(c.id));
}

export function canAccessCompany(user, companyId) {
  const scope = companyScopeOf(user);
  if (!scope) return true;
  return scope.includes(companyId);
}

export function getUserById(id) {
  return getMasterDb().prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
}

export function getUserByUsername(username) {
  return getMasterDb().prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username || ''));
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, username: user.username, full_name: user.full_name,
    role: user.role, active: !!user.active, company_scope: user.company_scope,
    created_at: user.created_at,
  };
}

// ---------------------------------------------------------------------------
// Company schema
// ---------------------------------------------------------------------------

export function ensureCompanySchema(db) {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      nature TEXT NOT NULL DEFAULT 'ASSET',
      category TEXT NOT NULL DEFAULT 'ASSET',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(parent_id, name)
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      opening_balance REAL NOT NULL DEFAULT 0,
      opening_type TEXT NOT NULL DEFAULT 'Dr' CHECK (opening_type IN ('Dr','Cr')),
      system_key TEXT UNIQUE,
      gstin TEXT DEFAULT '',
      gst_type TEXT DEFAULT 'Unregistered',
      state TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      credit_limit REAL NOT NULL DEFAULT 0,
      credit_days INTEGER NOT NULL DEFAULT 0,
      bank_name TEXT DEFAULT '',
      account_no TEXT DEFAULT '',
      ifsc TEXT DEFAULT '',
      upi TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER REFERENCES stock_groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS godowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      stock_group_id INTEGER REFERENCES stock_groups(id),
      unit_id INTEGER REFERENCES units(id),
      hsn TEXT DEFAULT '',
      gst_rate REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      opening_qty REAL NOT NULL DEFAULT 0,
      opening_rate REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 0,
      batch_enabled INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      seq INTEGER NOT NULL,
      number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      party_ledger_id INTEGER REFERENCES ledgers(id),
      from_ledger_id INTEGER REFERENCES ledgers(id),
      to_ledger_id INTEGER REFERENCES ledgers(id),
      narration TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      taxable REAL NOT NULL DEFAULT 0,
      cgst REAL NOT NULL DEFAULT 0,
      sgst REAL NOT NULL DEFAULT 0,
      igst REAL NOT NULL DEFAULT 0,
      cess REAL NOT NULL DEFAULT 0,
      roundoff REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_mode TEXT DEFAULT '',
      cheque_no TEXT DEFAULT '',
      cheque_date TEXT DEFAULT '',
      ref_voucher_id INTEGER REFERENCES vouchers(id),
      place_of_supply TEXT DEFAULT '',
      due_date TEXT DEFAULT '',
      created_by INTEGER,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS voucher_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
      entry_type TEXT NOT NULL CHECK (entry_type IN ('Dr','Cr')),
      amount REAL NOT NULL CHECK (amount >= 0),
      narration TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS voucher_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
      godown_id INTEGER REFERENCES godowns(id),
      qty REAL NOT NULL,
      rate REAL NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL,
      hsn TEXT DEFAULT '',
      gst_rate REAL NOT NULL DEFAULT 0,
      cgst REAL NOT NULL DEFAULT 0,
      sgst REAL NOT NULL DEFAULT 0,
      igst REAL NOT NULL DEFAULT 0,
      batch_no TEXT DEFAULT '',
      expiry_date TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS brs_entries (
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
      reconciled INTEGER NOT NULL DEFAULT 0,
      bank_date TEXT DEFAULT '',
      note TEXT DEFAULT '',
      PRIMARY KEY (voucher_id, ledger_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
    CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(type);
    CREATE INDEX IF NOT EXISTS idx_entries_ledger ON voucher_entries(ledger_id);
    CREATE INDEX IF NOT EXISTS idx_entries_voucher ON voucher_entries(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_items_voucher ON voucher_items(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_items_stock ON voucher_items(stock_item_id);
  `);

  // E-Way bill / transport details (naya feature — purane company DB me bhi migrate ho jayega).
  ensureColumn(db, 'vouchers', 'eway_bill_no', "TEXT DEFAULT ''");
  ensureColumn(db, 'vouchers', 'transport_name', "TEXT DEFAULT ''");
  ensureColumn(db, 'vouchers', 'vehicle_no', "TEXT DEFAULT ''");
  ensureColumn(db, 'vouchers', 'ship_to', "TEXT DEFAULT ''");
}

function addGroup(db, name, parentId, nature, category, isSystem = 1) {
  const info = db.prepare('INSERT INTO groups (name, parent_id, nature, category, is_system) VALUES (?,?,?,?,?)')
    .run(name, parentId, nature, category, isSystem);
  return Number(info.lastInsertRowid);
}

function addLedger(db, name, groupId, opts = {}) {
  const info = db.prepare(`INSERT INTO ledgers
    (name, group_id, opening_balance, opening_type, system_key, gstin, gst_type, state, phone, email, address,
     credit_limit, credit_days, bank_name, account_no, ifsc, upi, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    name, groupId, Number(opts.opening || 0), opts.openingType || 'Dr', opts.systemKey || null,
    opts.gstin || '', opts.gstType || 'Unregistered', opts.state || '', opts.phone || '', opts.email || '',
    opts.address || '', Number(opts.creditLimit || 0), Number(opts.creditDays || 0),
    opts.bankName || '', opts.accountNo || '', opts.ifsc || '', opts.upi || '', opts.active === false ? 0 : 1
  );
  return Number(info.lastInsertRowid);
}

export function seedCompanyMasters(db, company, { demo = false } = {}) {
  ensureCompanySchema(db);

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('books_from', company.books_from || '2026-04-01');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('financial_year', company.financial_year || '2026-2027');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('lock_date', '');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('company_state', company.state || 'Gujarat');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('stock_valuation', 'AVERAGE');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('credit_enforce', '1');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('expiry_alert_days', '30');

  const existing = db.prepare('SELECT COUNT(*) AS c FROM groups').get();
  if (existing.c > 0) return;

  // ---- Group hierarchy -----------------------------------------------------
  const assets = addGroup(db, 'Assets', null, 'ASSET', 'ASSET');
  const currentAssets = addGroup(db, 'Current Assets', assets, 'ASSET', 'ASSET');
  const cashGroup = addGroup(db, 'Cash-in-Hand', currentAssets, 'ASSET', 'ASSET');
  const bankGroup = addGroup(db, 'Bank Accounts', currentAssets, 'ASSET', 'ASSET');
  const debtorsGroup = addGroup(db, 'Sundry Debtors', currentAssets, 'ASSET', 'ASSET');
  const stockGroupAsset = addGroup(db, 'Stock-in-Hand', currentAssets, 'ASSET', 'ASSET');
  addGroup(db, 'Loans & Advances', currentAssets, 'ASSET', 'ASSET');
  addGroup(db, 'Fixed Assets', assets, 'ASSET', 'ASSET');

  const liabilities = addGroup(db, 'Liabilities', null, 'LIABILITY', 'LIABILITY');
  const currentLiabilities = addGroup(db, 'Current Liabilities', liabilities, 'LIABILITY', 'LIABILITY');
  const creditorsGroup = addGroup(db, 'Sundry Creditors', currentLiabilities, 'LIABILITY', 'LIABILITY');
  const dutiesGroup = addGroup(db, 'Duties & Taxes', currentLiabilities, 'LIABILITY', 'LIABILITY');
  addGroup(db, 'Provisions', currentLiabilities, 'LIABILITY', 'LIABILITY');
  addGroup(db, 'Loans', liabilities, 'LIABILITY', 'LIABILITY');

  const equity = addGroup(db, 'Equity', null, 'EQUITY', 'EQUITY');
  const capitalGroup = addGroup(db, 'Capital Account', equity, 'EQUITY', 'EQUITY');
  addGroup(db, 'Retained Earnings', equity, 'EQUITY', 'EQUITY');

  const income = addGroup(db, 'Income', null, 'INCOME', 'DIRECT_INCOME');
  const salesGroup = addGroup(db, 'Sales Accounts', income, 'INCOME', 'DIRECT_INCOME');
  addGroup(db, 'Direct Incomes', income, 'INCOME', 'DIRECT_INCOME');
  const indirectIncome = addGroup(db, 'Indirect Incomes', income, 'INCOME', 'INDIRECT_INCOME');

  const expense = addGroup(db, 'Expenses', null, 'EXPENSE', 'DIRECT_EXPENSE');
  const purchaseGroup = addGroup(db, 'Purchase Accounts', expense, 'EXPENSE', 'DIRECT_EXPENSE');
  const directExpense = addGroup(db, 'Direct Expenses', expense, 'EXPENSE', 'DIRECT_EXPENSE');
  const indirectExpense = addGroup(db, 'Indirect Expenses', expense, 'EXPENSE', 'INDIRECT_EXPENSE');

  // ---- Default ledgers ----------------------------------------------------
  addLedger(db, 'Cash', cashGroup, { opening: 50000, openingType: 'Dr', systemKey: 'CASH', gstType: 'Unregistered' });
  addLedger(db, 'HDFC Bank', bankGroup, {
    opening: 250000, openingType: 'Dr', systemKey: 'BANK', gstType: 'Unregistered', state: company.state,
    bankName: 'HDFC Bank', accountNo: '50200012345678', ifsc: 'HDFC0000123', upi: 'bahi@hdfcbank',
  });

  addLedger(db, 'Rajesh Textiles', debtorsGroup, { opening: 120000, openingType: 'Dr', gstin: '24ABCDE1234F1Z5', gstType: 'Regular', state: 'Gujarat', phone: '9825011111', creditLimit: 200000, creditDays: 30 });
  addLedger(db, 'Meera Fabrics', debtorsGroup, { opening: 80000, openingType: 'Dr', gstin: '24PQRSX5678K1Z2', gstType: 'Regular', state: 'Gujarat', phone: '9825022222', creditLimit: 150000, creditDays: 21 });
  addLedger(db, 'Aakash Garments', debtorsGroup, { opening: 60000, openingType: 'Dr', gstin: '27LMNOP9012Q1Z8', gstType: 'Regular', state: 'Maharashtra', phone: '9870033333', creditLimit: 100000, creditDays: 15 });

  addLedger(db, 'Surat Weaving Mills', creditorsGroup, { opening: 150000, openingType: 'Cr', gstin: '24SURAT5678M1Z4', gstType: 'Regular', state: 'Gujarat', phone: '9825044444' });
  addLedger(db, 'Gujarat Yarn Co', creditorsGroup, { opening: 90000, openingType: 'Cr', gstin: '24GUJAR9012N1Z6', gstType: 'Regular', state: 'Gujarat', phone: '9825055555' });

  addLedger(db, 'Sales', salesGroup, { systemKey: 'SALES' });
  addLedger(db, 'Purchases', purchaseGroup, { systemKey: 'PURCHASE', openingType: 'Dr' });

  addLedger(db, 'Output CGST', dutiesGroup, { systemKey: 'OUT_CGST', openingType: 'Cr' });
  addLedger(db, 'Output SGST', dutiesGroup, { systemKey: 'OUT_SGST', openingType: 'Cr' });
  addLedger(db, 'Output IGST', dutiesGroup, { systemKey: 'OUT_IGST', openingType: 'Cr' });
  addLedger(db, 'Input CGST', dutiesGroup, { systemKey: 'IN_CGST', openingType: 'Dr' });
  addLedger(db, 'Input SGST', dutiesGroup, { systemKey: 'IN_SGST', openingType: 'Dr' });
  addLedger(db, 'Input IGST', dutiesGroup, { systemKey: 'IN_IGST', openingType: 'Dr' });
  addLedger(db, 'Round Off', indirectIncome, { systemKey: 'ROUND_OFF', openingType: 'Cr' });

  addLedger(db, 'Capital', capitalGroup, { opening: 320000, openingType: 'Cr' });

  addLedger(db, 'Rent', indirectExpense, { openingType: 'Dr' });
  addLedger(db, 'Salaries', indirectExpense, { openingType: 'Dr' });
  addLedger(db, 'Electricity', indirectExpense, { openingType: 'Dr' });
  addLedger(db, 'Telephone & Internet', indirectExpense, { openingType: 'Dr' });
  addLedger(db, 'Bad Debts', indirectExpense, { openingType: 'Dr' });
  addLedger(db, 'Carriage Inward', directExpense, { openingType: 'Dr' });
  addLedger(db, 'Interest Income', indirectIncome, { openingType: 'Cr' });
  addLedger(db, 'Stock Opening', stockGroupAsset, { openingType: 'Dr' });

  // ---- Stock masters ------------------------------------------------------
  const textiles = Number(db.prepare('INSERT INTO stock_groups (name) VALUES (?)').run('Textiles').lastInsertRowid);
  const readymade = Number(db.prepare('INSERT INTO stock_groups (name) VALUES (?)').run('Readymade').lastInsertRowid);
  const pcs = Number(db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run('Pieces', 'Pcs').lastInsertRowid);
  const mtr = Number(db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run('Meter', 'Mtr').lastInsertRowid);
  db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run('Box', 'Box');
  db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run('Kilogram', 'Kg');
  db.prepare('INSERT INTO units (name, symbol) VALUES (?,?)').run('Pack', 'Pack');

  const mainStore = Number(db.prepare('INSERT INTO godowns (name, address, is_default) VALUES (?,?,1)').run('Main Store', 'Ring Road, Surat').lastInsertRowid);
  db.prepare('INSERT INTO godowns (name, address, is_default) VALUES (?,?,0)').run('Surat Godown', 'Pandesara GIDC, Surat');

  const addItem = (name, groupId, unitId, hsn, gst, sale, purchase, openQty, openRate, reorder) => {
    db.prepare(`INSERT INTO stock_items (name, stock_group_id, unit_id, hsn, gst_rate, sale_price, purchase_price, opening_qty, opening_rate, reorder_level)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name, groupId, unitId, hsn, gst, sale, purchase, openQty, openRate, reorder);
  };
  addItem('Cotton Saree', textiles, pcs, '5208', 5, 850, 600, 20, 550, 10);
  addItem('Silk Dupatta', textiles, pcs, '5407', 12, 1200, 900, 10, 850, 5);
  addItem('Linen Shirt', readymade, pcs, '6205', 5, 650, 480, 30, 450, 10);
  addItem('Polyester Fabric', textiles, mtr, '5407', 12, 180, 120, 50, 110, 20);
  addItem('Cotton Fabric', textiles, mtr, '5208', 5, 150, 100, 100, 95, 25);

  if (demo) seedDemoVouchers(db, company);
  return { mainStore };
}

function dateAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function seedDemoVouchers(db, company) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM vouchers').get().c;
  if (count > 0) return;

  const lid = (name) => db.prepare('SELECT id FROM ledgers WHERE name = ?').get(name)?.id;
  const sid = (name) => db.prepare('SELECT id FROM stock_items WHERE name = ?').get(name)?.id;
  const actor = { id: 1, username: 'admin', full_name: 'Super Admin', role: 'super_admin' };
  const post = (payload) => {
    try { saveVoucher(db, company, payload, actor); }
    catch (err) { console.error('Demo voucher seed failed:', payload.type, err.message); }
  };

  post({ type: 'PURCHASE', date: dateAgo(110), party_ledger_id: lid('Surat Weaving Mills'), narration: 'Opening season purchase - cotton sarees, silk & linen', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 25, rate: 600, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 15, rate: 900, gst_rate: 12 },
    { stock_item_id: sid('Linen Shirt'), qty: 20, rate: 480, gst_rate: 5 },
  ] });
  post({ type: 'PURCHASE', date: dateAgo(95), party_ledger_id: lid('Gujarat Yarn Co'), narration: 'Polyester fabric stock', items: [
    { stock_item_id: sid('Polyester Fabric'), qty: 50, rate: 120, gst_rate: 12 },
  ] });
  post({ type: 'SALES', date: dateAgo(80), party_ledger_id: lid('Rajesh Textiles'), narration: 'Retail counter sale', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 10, rate: 850, discount_pct: 2, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 5, rate: 1200, gst_rate: 12 },
  ] });
  post({ type: 'SALES', date: dateAgo(70), party_ledger_id: lid('Aakash Garments'), narration: 'Outstation order - Pune', items: [
    { stock_item_id: sid('Linen Shirt'), qty: 8, rate: 650, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 4, rate: 1200, gst_rate: 12 },
  ] });
  post({ type: 'RECEIPT', date: dateAgo(65), from_ledger_id: lid('Rajesh Textiles'), to_ledger_id: lid('HDFC Bank'), amount: 15000, payment_mode: 'Bank Transfer', narration: 'Part payment received' });
  post({ type: 'PAYMENT', date: dateAgo(60), from_ledger_id: lid('HDFC Bank'), to_ledger_id: lid('Surat Weaving Mills'), amount: 40000, payment_mode: 'Cheque', cheque_no: '004521', cheque_date: dateAgo(60), narration: 'Supplier payment' });
  post({ type: 'PAYMENT', date: dateAgo(55), from_ledger_id: lid('Cash'), to_ledger_id: lid('Rent'), amount: 8000, payment_mode: 'Cash', narration: 'Shop rent' });
  post({ type: 'PURCHASE', date: dateAgo(25), party_ledger_id: lid('Surat Weaving Mills'), narration: 'Fresh stock inward', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 15, rate: 620, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 10, rate: 950, gst_rate: 12 },
  ] });
  post({ type: 'SALES', date: dateAgo(35), party_ledger_id: lid('Meera Fabrics'), narration: 'Wholesale sale', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 6, rate: 860, gst_rate: 5 },
    { stock_item_id: sid('Linen Shirt'), qty: 10, rate: 680, gst_rate: 5 },
  ] });
  post({ type: 'CREDIT_NOTE', date: dateAgo(30), party_ledger_id: lid('Meera Fabrics'), narration: 'Sales return - damaged sarees', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 2, rate: 860, gst_rate: 5 },
  ] });
  post({ type: 'RECEIPT', date: dateAgo(25), from_ledger_id: lid('Meera Fabrics'), to_ledger_id: lid('Cash'), amount: 25000, payment_mode: 'Cash', narration: 'Cash received against bill' });
  post({ type: 'SALES', date: dateAgo(20), party_ledger_id: lid('Meera Fabrics'), narration: 'Festive bulk order', items: [
    { stock_item_id: sid('Silk Dupatta'), qty: 10, rate: 1250, gst_rate: 12 },
    { stock_item_id: sid('Cotton Saree'), qty: 10, rate: 880, gst_rate: 5 },
  ] });
  post({ type: 'CONTRA', date: dateAgo(20), from_ledger_id: lid('Cash'), to_ledger_id: lid('HDFC Bank'), amount: 20000, narration: 'Cash deposited into bank' });
  post({ type: 'PAYMENT', date: dateAgo(15), from_ledger_id: lid('HDFC Bank'), to_ledger_id: lid('Salaries'), amount: 22000, payment_mode: 'Bank Transfer', narration: 'Staff salary' });
  post({ type: 'SALES', date: dateAgo(12), party_ledger_id: lid('Rajesh Textiles'), narration: 'Bulk saree order', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 20, rate: 890, gst_rate: 5 },
  ] });
  post({ type: 'PAYMENT', date: dateAgo(12), from_ledger_id: lid('Cash'), to_ledger_id: lid('Electricity'), amount: 3500, payment_mode: 'UPI', narration: 'Electricity bill' });
  post({ type: 'SALES', date: dateAgo(10), party_ledger_id: lid('Rajesh Textiles'), narration: 'Festive season sale', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 8, rate: 880, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 6, rate: 1250, gst_rate: 12 },
  ] });
  post({ type: 'JOURNAL', date: dateAgo(8), narration: 'Bad debts written off', entries: [
    { ledger_id: lid('Bad Debts'), entry_type: 'Dr', amount: 3000 },
    { ledger_id: lid('Rajesh Textiles'), entry_type: 'Cr', amount: 3000 },
  ] });
  post({ type: 'SALES', date: dateAgo(5), party_ledger_id: lid('Aakash Garments'), narration: 'Outstation sale - Mumbai', items: [
    { stock_item_id: sid('Linen Shirt'), qty: 12, rate: 660, gst_rate: 5 },
    { stock_item_id: sid('Polyester Fabric'), qty: 20, rate: 180, gst_rate: 12 },
  ] });
  post({ type: 'SALES', date: dateAgo(4), party_ledger_id: lid('Aakash Garments'), narration: 'Repeat order - Pune', items: [
    { stock_item_id: sid('Polyester Fabric'), qty: 15, rate: 200, gst_rate: 12 },
    { stock_item_id: sid('Linen Shirt'), qty: 10, rate: 700, gst_rate: 5 },
  ] });
  post({ type: 'PURCHASE', date: dateAgo(3), party_ledger_id: lid('Gujarat Yarn Co'), narration: 'Yarn stock replenishment', items: [
    { stock_item_id: sid('Polyester Fabric'), qty: 25, rate: 125, gst_rate: 12 },
  ] });
  post({ type: 'RECEIPT', date: dateAgo(2), from_ledger_id: lid('Aakash Garments'), to_ledger_id: lid('HDFC Bank'), amount: 30000, payment_mode: 'NEFT', narration: 'Payment received' });
  post({ type: 'RECEIPT', date: dateAgo(1), from_ledger_id: lid('Rajesh Textiles'), to_ledger_id: lid('Cash'), amount: 20000, payment_mode: 'Cash', narration: 'Counter payment received' });
  post({ type: 'SALES', date: dateAgo(0), party_ledger_id: lid('Rajesh Textiles'), narration: 'Today counter sale', items: [
    { stock_item_id: sid('Cotton Saree'), qty: 5, rate: 900, gst_rate: 5 },
    { stock_item_id: sid('Silk Dupatta'), qty: 3, rate: 1300, gst_rate: 12 },
  ] });
}

let schemaReady = false;

export function ensureMasterSeed() {
  const db = getMasterDb();

  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
    const insert = db.prepare('INSERT INTO users (username, password_hash, full_name, role, company_scope) VALUES (?,?,?,?,?)');
    insert.run('admin', hashPassword('admin123'), 'Super Admin', 'super_admin', 'ALL');
    insert.run('owner', hashPassword('owner123'), 'Shop Owner', 'owner', 'ALL');
    insert.run('manager', hashPassword('manager123'), 'Branch Manager', 'manager', 'ALL');
    insert.run('operator', hashPassword('operator123'), 'Data Entry Operator', 'operator', 'ALL');
    insert.run('auditor', hashPassword('auditor123'), 'CA Auditor', 'auditor', 'ALL');
  }

  if (db.prepare('SELECT COUNT(*) AS c FROM companies').get().c === 0) {
    const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
    const company = createCompany({
      name: 'Shree Ganesh Traders', financial_year: '2026-2027', books_from: '2026-04-01',
      currency: 'INR', gstin: '24AABCS1429B1Z1', pan: 'AABCS1429B',
      address: '12, Ring Road, Textile Market', city: 'Surat', state: 'Gujarat', pincode: '395002',
      phone: '9825012345', email: 'accounts@shreeganesh.example',
    }, admin, { demo: true, seed: true });

    // Scope the demo staff users to this company only.
    const scope = JSON.stringify([company.id]);
    db.prepare("UPDATE users SET company_scope = ? WHERE username IN ('manager','operator','auditor')").run(scope);
  }
  schemaReady = true;
}

export function createCompany(input, actor, { demo = false } = {}) {
  const db = getMasterDb();
  const name = String(input.name || '').trim();
  if (!name) { const e = new Error('Company name required'); e.status = 400; throw e; }
  if (name.length > 120) { const e = new Error('Company name too long'); e.status = 400; throw e; }

  const id = `COMP_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const folder = path.join(COMPANIES_DIR, id);
  fs.mkdirSync(folder, { recursive: true });
  const dbPath = path.join(folder, 'company.db');

  const company = {
    id,
    name,
    financial_year: String(input.financial_year || '2026-2027').slice(0, 20),
    books_from: String(input.books_from || '2026-04-01').slice(0, 10),
    currency: String(input.currency || 'INR').slice(0, 8),
    gstin: String(input.gstin || '').slice(0, 20),
    pan: String(input.pan || '').slice(0, 20),
    address: String(input.address || '').slice(0, 300),
    city: String(input.city || '').slice(0, 80),
    state: String(input.state || 'Gujarat').slice(0, 80),
    pincode: String(input.pincode || '').slice(0, 10),
    phone: String(input.phone || '').slice(0, 30),
    email: String(input.email || '').slice(0, 120),
  };

  db.prepare(`INSERT INTO companies (id, name, financial_year, books_from, currency, gstin, pan, address, city, state, pincode, phone, email, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    company.id, company.name, company.financial_year, company.books_from, company.currency,
    company.gstin, company.pan, company.address, company.city, company.state, company.pincode,
    company.phone, company.email, actor?.id || null
  );

  const cdb = new DatabaseSync(dbPath);
  ensureCompanySchema(cdb);
  seedCompanyMasters(cdb, company, { demo });
  companyCache.set(id, cdb);
  audit({ companyId: id, user: actor, action: 'COMPANY_CREATE', detail: `Company ${name} created` });
  return company;
}

export function getCompanyDb(companyId) {
  if (!companyId) { const e = new Error('Company select karo'); e.status = 400; throw e; }
  const company = getMasterDb().prepare('SELECT * FROM companies WHERE id = ?').get(String(companyId));
  if (!company) { const e = new Error('Company nahi mili'); e.status = 404; throw e; }
  if (companyCache.has(companyId)) return { db: companyCache.get(companyId), company };
  const dbPath = path.join(COMPANIES_DIR, companyId, 'company.db');
  if (!fs.existsSync(dbPath)) { const e = new Error('Company database file missing hai'); e.status = 500; throw e; }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  companyCache.set(companyId, db);
  return { db, company };
}

export function touchCompany(companyId) {
  const { db } = getCompanyDb(companyId);
  return db;
}

export function backupCompany(companyId) {
  const { db } = getCompanyDb(companyId);
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch {}
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `${companyId}-${stamp}.db`);
  fs.copyFileSync(path.join(COMPANIES_DIR, companyId, 'company.db'), dest);
  const all = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(`${companyId}-`)).sort().reverse();
  for (const old of all.slice(10)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {}
  }
  return dest;
}

export { schemaReady };
