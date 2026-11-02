// Core double-entry voucher engine.
// Every voucher is validated and converted into balanced journal lines here.
// The UI never decides debits/credits for sales, purchase or tax vouchers.

export const VOUCHER_TYPES = {
  SALES: { label: 'Sales', prefix: 'SAL', stock: 'out', party: true, items: true, shortcut: 'F8' },
  PURCHASE: { label: 'Purchase', prefix: 'PUR', stock: 'in', party: true, items: true, shortcut: 'F9' },
  PAYMENT: { label: 'Payment', prefix: 'PAY', stock: null, party: false, items: false, shortcut: 'F5' },
  RECEIPT: { label: 'Receipt', prefix: 'REC', stock: null, party: false, items: false, shortcut: 'F6' },
  CONTRA: { label: 'Contra', prefix: 'CON', stock: null, party: false, items: false, shortcut: 'F4' },
  JOURNAL: { label: 'Journal', prefix: 'JRN', stock: null, party: false, items: false, shortcut: 'F7' },
  CREDIT_NOTE: { label: 'Credit Note', prefix: 'CRN', stock: 'in', party: true, items: true, shortcut: 'Alt+F6' },
  DEBIT_NOTE: { label: 'Debit Note', prefix: 'DBN', stock: 'out', party: true, items: true, shortcut: 'Alt+F5' },
};

const PREFIX = Object.fromEntries(Object.entries(VOUCHER_TYPES).map(([k, v]) => [k, v.prefix]));

export class VoucherError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);

function num(v, label, { min = 0, required = true } = {}) {
  if (v === '' || v === null || v === undefined) {
    if (required) throw new VoucherError(`${label} required hai`);
    return 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new VoucherError(`${label} valid number hona chahiye`);
  if (n < min) throw new VoucherError(`${label} ${min} se kam nahi ho sakta`);
  return n;
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new VoucherError('Date YYYY-MM-DD format me honi chahiye');
  }
  return date;
}

function ledgerOrThrow(db, id, label = 'Ledger') {
  const ledger = db.prepare('SELECT * FROM ledgers WHERE id = ? AND is_active = 1').get(Number(id));
  if (!ledger) throw new VoucherError(`${label} select karo`);
  return ledger;
}

// Ledger ka signed balance (Dr = positive) as on date — credit limit check ke liye.
export function ledgerOutstanding(db, ledgerId, asOn) {
  const ledger = db.prepare('SELECT opening_balance, opening_type FROM ledgers WHERE id = ?').get(Number(ledgerId));
  if (!ledger) return 0;
  const opening = (ledger.opening_type === 'Dr' ? ledger.opening_balance : -ledger.opening_balance);
  const move = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN e.entry_type='Dr' THEN e.amount ELSE 0 END),0) AS dr,
      COALESCE(SUM(CASE WHEN e.entry_type='Cr' THEN e.amount ELSE 0 END),0) AS cr
    FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
    WHERE e.ledger_id = ? AND date(v.date) <= date(?)`).get(Number(ledgerId), asOn);
  return round2(opening + move.dr - move.cr);
}

function systemLedger(db, key, label) {
  const ledger = db.prepare('SELECT * FROM ledgers WHERE system_key = ?').get(key);
  if (!ledger) throw new VoucherError(`${label} ledger missing hai. Company masters check karo.`);
  return ledger;
}

function isInterState(company, party, placeOfSupply) {
  const companyState = String(company.state || '').trim().toLowerCase();
  const partyState = String(placeOfSupply || party?.state || '').trim().toLowerCase();
  if (!companyState || !partyState) return false;
  return companyState !== partyState;
}

function taxLines(db, side, taxableTotal, taxes, isInter) {
  // side: 'output' (sales/credit note) or 'input' (purchase/debit note)
  const lines = [];
  const suffix = side === 'output' ? 'OUT' : 'IN';
  if (isInter) {
    if (taxes.igst > 0) lines.push({ ledger_id: systemLedger(db, `${suffix}_IGST`, 'IGST').id, entry_type: side === 'output' ? 'Cr' : 'Dr', amount: taxes.igst });
  } else {
    if (taxes.cgst > 0) lines.push({ ledger_id: systemLedger(db, `${suffix}_CGST`, 'CGST').id, entry_type: side === 'output' ? 'Cr' : 'Dr', amount: taxes.cgst });
    if (taxes.sgst > 0) lines.push({ ledger_id: systemLedger(db, `${suffix}_SGST`, 'SGST').id, entry_type: side === 'output' ? 'Cr' : 'Dr', amount: taxes.sgst });
  }
  return lines;
}

function computeItemVoucher(db, company, payload) {
  const type = payload.type;
  const cfg = VOUCHER_TYPES[type];
  if (!cfg?.items) throw new VoucherError('Invalid item voucher type');
  const party = ledgerOrThrow(db, payload.party_ledger_id, 'Party');
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new VoucherError('Kam se kam ek item add karo');

  const inter = isInterState(company, party, payload.place_of_supply);
  let taxableTotal = 0;
  let discountTotal = 0;
  const taxes = { cgst: 0, sgst: 0, igst: 0, cess: 0 };
  const preparedItems = [];

  for (const [index, raw] of items.entries()) {
    const stock = db.prepare('SELECT * FROM stock_items WHERE id = ? AND is_active = 1').get(Number(raw.stock_item_id));
    if (!stock) throw new VoucherError(`Row ${index + 1}: stock item select karo`);
    const qty = num(raw.qty, `Row ${index + 1}: Quantity`, { min: 0.0001 });
    const rate = num(raw.rate, `Row ${index + 1}: Rate`, { min: 0 });
    const discountPct = num(raw.discount_pct, `Row ${index + 1}: Discount %`, { required: false, min: 0 });
    if (discountPct > 100) throw new VoucherError(`Row ${index + 1}: Discount 100% se zyada nahi`);
    const gstRate = num(raw.gst_rate ?? stock.gst_rate, `Row ${index + 1}: GST rate`, { required: false, min: 0 });
    const gross = round2(qty * rate);
    const discount = round2((gross * discountPct) / 100);
    const taxable = round2(gross - discount);

    let cgst = 0, sgst = 0, igst = 0;
    const tax = round2((taxable * gstRate) / 100);
    if (inter) igst = tax;
    else {
      cgst = round2(tax / 2);
      sgst = round2(tax - cgst);
    }

    const godown = raw.godown_id
      ? db.prepare('SELECT * FROM godowns WHERE id = ?').get(Number(raw.godown_id))
      : db.prepare('SELECT * FROM godowns WHERE is_default = 1 LIMIT 1').get();
    if (!godown) throw new VoucherError('Default godown missing hai');

    taxableTotal = round2(taxableTotal + taxable);
    discountTotal = round2(discountTotal + discount);
    taxes.cgst = round2(taxes.cgst + cgst);
    taxes.sgst = round2(taxes.sgst + sgst);
    taxes.igst = round2(taxes.igst + igst);

    preparedItems.push({
      stock_item_id: stock.id,
      godown_id: godown.id,
      qty,
      rate,
      discount_pct: discountPct,
      amount: taxable,
      hsn: raw.hsn || stock.hsn || '',
      gst_rate: gstRate,
      cgst, sgst, igst,
      batch_no: raw.batch_no || '',
      expiry_date: raw.expiry_date || '',
    });
  }

  const taxTotal = round2(taxes.cgst + taxes.sgst + taxes.igst);
  const rawTotal = round2(taxableTotal + taxTotal);
  const total = Math.round(rawTotal);
  const roundoff = round2(total - rawTotal);
  const lines = [];

  if (type === 'SALES' || type === 'CREDIT_NOTE') {
    const sales = systemLedger(db, 'SALES', 'Sales');
    lines.push({ ledger_id: party.id, entry_type: 'Dr', amount: total, narration: 'Party account' });
    lines.push({ ledger_id: sales.id, entry_type: 'Cr', amount: taxableTotal, narration: 'Sales value' });
    lines.push(...taxLines(db, 'output', taxableTotal, taxes, inter));
  } else {
    const purchase = systemLedger(db, 'PURCHASE', 'Purchase');
    lines.push({ ledger_id: party.id, entry_type: 'Cr', amount: total, narration: 'Party account' });
    lines.push({ ledger_id: purchase.id, entry_type: 'Dr', amount: taxableTotal, narration: 'Purchase value' });
    lines.push(...taxLines(db, 'input', taxableTotal, taxes, inter));
  }

  if (roundoff !== 0) {
    const ro = systemLedger(db, 'ROUND_OFF', 'Round Off');
    if (type === 'SALES' || type === 'CREDIT_NOTE') {
      lines.push(roundoff > 0
        ? { ledger_id: ro.id, entry_type: 'Cr', amount: roundoff, narration: 'Round off' }
        : { ledger_id: ro.id, entry_type: 'Dr', amount: Math.abs(roundoff), narration: 'Round off' });
    } else {
      lines.push(roundoff > 0
        ? { ledger_id: ro.id, entry_type: 'Dr', amount: roundoff, narration: 'Round off' }
        : { ledger_id: ro.id, entry_type: 'Cr', amount: Math.abs(roundoff), narration: 'Round off' });
    }
  }

  return {
    party_ledger_id: party.id,
    from_ledger_id: null,
    to_ledger_id: null,
    subtotal: round2(taxableTotal + discountTotal),
    discount: discountTotal,
    taxable: taxableTotal,
    cgst: taxes.cgst,
    sgst: taxes.sgst,
    igst: taxes.igst,
    cess: 0,
    roundoff,
    total,
    place_of_supply: payload.place_of_supply || party.state || company.state || '',
    items: preparedItems,
    entries: lines,
    taxMode: inter ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)',
  };
}

function computeSimpleVoucher(db, payload) {
  const type = payload.type;
  let entries = [];

  if (type === 'JOURNAL') {
    const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
    if (rawEntries.length < 2) throw new VoucherError('Journal me kam se kam 2 entries chahiye');
    let dr = 0, cr = 0;
    for (const [i, row] of rawEntries.entries()) {
      const ledger = ledgerOrThrow(db, row.ledger_id, `Journal row ${i + 1} ledger`);
      const amt = round2(num(row.amount, `Journal row ${i + 1} amount`, { min: 0.01 }));
      const entryType = row.entry_type === 'Cr' ? 'Cr' : 'Dr';
      if (entryType === 'Dr') dr = round2(dr + amt); else cr = round2(cr + amt);
      entries.push({ ledger_id: ledger.id, entry_type: entryType, amount: amt, narration: row.narration || '' });
    }
    if (Math.abs(dr - cr) > 0.009) {
      throw new VoucherError(`Journal balance nahi hai. Debit ₹${dr.toFixed(2)} vs Credit ₹${cr.toFixed(2)}`);
    }
    return {
      party_ledger_id: null, from_ledger_id: null, to_ledger_id: null,
      subtotal: dr, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0,
      roundoff: 0, total: dr, entries, items: [],
    };
  }

  const amount = round2(num(payload.amount, 'Amount', { min: 0.01 }));
  const from = ledgerOrThrow(db, payload.from_ledger_id, 'From / Credit ledger');
  const to = ledgerOrThrow(db, payload.to_ledger_id, 'To / Debit ledger');
  if (from.id === to.id) throw new VoucherError('From aur To ledger same nahi ho sakte');

  // Payment: Dr party/expense, Cr cash/bank. Receipt: Dr cash/bank, Cr party. Contra: Dr destination, Cr source.
  entries = [
    { ledger_id: to.id, entry_type: 'Dr', amount, narration: payload.narration || '' },
    { ledger_id: from.id, entry_type: 'Cr', amount, narration: payload.narration || '' },
  ];

  return {
    party_ledger_id: payload.party_ledger_id ? Number(payload.party_ledger_id) : null,
    from_ledger_id: from.id,
    to_ledger_id: to.id,
    subtotal: amount, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0,
    roundoff: 0, total: amount, entries, items: [],
  };
}

function validateDateWithinBooks(date, company) {
  if (company.books_from && date < company.books_from) {
    throw new VoucherError(`Date books beginning (${company.books_from}) se pehle ki nahi ho sakti`);
  }
}

function checkPeriodLock(db, date, user) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'lock_date'").get();
  if (row?.value && date <= row.value && user?.role !== 'super_admin') {
    throw new VoucherError(`Books ${row.value} tak locked hain. Entry ke liye admin se contact karo.`, 423);
  }
}

export function saveVoucher(db, company, rawPayload, user, existing = null) {
  const type = String(rawPayload.type || existing?.type || '').toUpperCase();
  const cfg = VOUCHER_TYPES[type];
  if (!cfg) throw new VoucherError('Voucher type invalid hai');
  if (existing && existing.type !== type) throw new VoucherError('Voucher type change nahi ho sakta');

  const date = assertDate(rawPayload.date || existing?.date || today());
  validateDateWithinBooks(date, company);
  checkPeriodLock(db, date, user);

  const payload = { ...rawPayload, type };
  const computed = cfg.items ? computeItemVoucher(db, company, payload) : computeSimpleVoucher(db, payload);

  // Final safety net: every voucher must balance.
  const dr = round2(computed.entries.filter(e => e.entry_type === 'Dr').reduce((s, e) => s + e.amount, 0));
  const cr = round2(computed.entries.filter(e => e.entry_type === 'Cr').reduce((s, e) => s + e.amount, 0));
  if (Math.abs(dr - cr) > 0.009) {
    throw new VoucherError(`Internal posting error: Debit ${dr} != Credit ${cr}`, 500);
  }

  let dueDate = rawPayload.due_date ? assertDate(rawPayload.due_date) : '';

  // Credit limit + credit days locking (Sales voucher par).
  if (type === 'SALES' && computed.party_ledger_id) {
    const party = db.prepare('SELECT * FROM ledgers WHERE id = ?').get(computed.party_ledger_id);
    let outstanding = ledgerOutstanding(db, party.id, date);
    if (existing && existing.type === 'SALES') outstanding = round2(outstanding - existing.total);
    const enforce = (db.prepare("SELECT value FROM settings WHERE key='credit_enforce'").get()?.value ?? '1') !== '0';
    const canOverride = !!rawPayload.override_credit_limit && user?.role !== 'operator';
    if (enforce && !canOverride && Number(party?.credit_limit) > 0 && outstanding + computed.total > Number(party.credit_limit) + 0.009) {
      const err = new VoucherError(
        `Credit limit cross ho raha hai — ${party.name}: limit ₹${Number(party.credit_limit).toFixed(2)}, `
        + `aaj tak outstanding ₹${outstanding.toFixed(2)}, is bill ke baad ₹${round2(outstanding + computed.total).toFixed(2)}. `
        + 'Owner/Manager override kar sakta hai.', 409);
      err.code = 'CREDIT_LIMIT';
      throw err;
    }
    if (!dueDate && Number(party?.credit_days) > 0) {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Number(party.credit_days));
      dueDate = d.toISOString().slice(0, 10);
    }
  }

  const narration = String(rawPayload.narration || '').slice(0, 1000);
  const paymentMode = String(rawPayload.payment_mode || '').slice(0, 40);
  const chequeNo = String(rawPayload.cheque_no || '').slice(0, 60);
  const chequeDate = rawPayload.cheque_date ? assertDate(rawPayload.cheque_date) : '';
  const ewayBillNo = String(rawPayload.eway_bill_no || '').slice(0, 20);
  const transportName = String(rawPayload.transport_name || '').slice(0, 120);
  const vehicleNo = String(rawPayload.vehicle_no || '').slice(0, 20);
  const shipTo = String(rawPayload.ship_to || '').slice(0, 300);
  const refVoucherId = rawPayload.ref_voucher_id ? Number(rawPayload.ref_voucher_id) : null;

  db.exec('BEGIN IMMEDIATE');
  try {
    let id, number, seq;
    if (existing) {
      id = existing.id;
      number = existing.number;
      seq = existing.seq;
      db.prepare(`UPDATE vouchers SET date=?, party_ledger_id=?, from_ledger_id=?, to_ledger_id=?, narration=?,
        subtotal=?, discount=?, taxable=?, cgst=?, sgst=?, igst=?, cess=?, roundoff=?, total=?,
        payment_mode=?, cheque_no=?, cheque_date=?, ref_voucher_id=?, place_of_supply=?, due_date=?,
        eway_bill_no=?, transport_name=?, vehicle_no=?, ship_to=?,
        updated_at=datetime('now') WHERE id=?`).run(
        date, computed.party_ledger_id, computed.from_ledger_id, computed.to_ledger_id, narration,
        computed.subtotal, computed.discount, computed.taxable, computed.cgst, computed.sgst,
        computed.igst, computed.cess, computed.roundoff, computed.total,
        paymentMode, chequeNo, chequeDate, refVoucherId, computed.place_of_supply || '', dueDate,
        ewayBillNo, transportName, vehicleNo, shipTo, id
      );
      db.prepare('DELETE FROM voucher_entries WHERE voucher_id = ?').run(id);
      db.prepare('DELETE FROM voucher_items WHERE voucher_id = ?').run(id);
    } else {
      const max = db.prepare('SELECT COALESCE(MAX(seq),0) AS s FROM vouchers WHERE type = ?').get(type);
      seq = Number(max.s) + 1;
      number = `${PREFIX[type]}/${String(seq).padStart(4, '0')}`;
      const info = db.prepare(`INSERT INTO vouchers
        (type, seq, number, date, party_ledger_id, from_ledger_id, to_ledger_id, narration,
         subtotal, discount, taxable, cgst, sgst, igst, cess, roundoff, total,
         payment_mode, cheque_no, cheque_date, ref_voucher_id, place_of_supply, due_date,
         eway_bill_no, transport_name, vehicle_no, ship_to, created_by, created_by_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        type, seq, number, date, computed.party_ledger_id, computed.from_ledger_id, computed.to_ledger_id, narration,
        computed.subtotal, computed.discount, computed.taxable, computed.cgst, computed.sgst,
        computed.igst, computed.cess, computed.roundoff, computed.total,
        paymentMode, chequeNo, chequeDate, refVoucherId, computed.place_of_supply || '', dueDate,
        ewayBillNo, transportName, vehicleNo, shipTo,
        user?.id || null, user?.full_name || user?.username || 'System'
      );
      id = Number(info.lastInsertRowid);
    }

    const entryStmt = db.prepare('INSERT INTO voucher_entries (voucher_id, ledger_id, entry_type, amount, narration) VALUES (?,?,?,?,?)');
    for (const e of computed.entries) entryStmt.run(id, e.ledger_id, e.entry_type, round2(e.amount), e.narration || '');

    const itemStmt = db.prepare(`INSERT INTO voucher_items
      (voucher_id, stock_item_id, godown_id, qty, rate, discount_pct, amount, hsn, gst_rate, cgst, sgst, igst, batch_no, expiry_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const it of computed.items) {
      itemStmt.run(id, it.stock_item_id, it.godown_id, it.qty, it.rate, it.discount_pct, it.amount,
        it.hsn || '', it.gst_rate, it.cgst, it.sgst, it.igst, it.batch_no || '', it.expiry_date || '');
    }

    db.exec('COMMIT');
    return { id, number, seq, total: computed.total, taxMode: computed.taxMode || null };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

export function deleteVoucher(db, id, user) {
  const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(Number(id));
  if (!voucher) throw new VoucherError('Voucher nahi mila', 404);
  checkPeriodLock(db, voucher.date, user);
  db.prepare('DELETE FROM vouchers WHERE id = ?').run(voucher.id);
  return voucher;
}

export function getVoucherFull(db, id) {
  const voucher = db.prepare(`SELECT v.*, p.name AS party_name, fl.name AS from_name, tl.name AS to_name
    FROM vouchers v
    LEFT JOIN ledgers p ON p.id = v.party_ledger_id
    LEFT JOIN ledgers fl ON fl.id = v.from_ledger_id
    LEFT JOIN ledgers tl ON tl.id = v.to_ledger_id
    WHERE v.id = ?`).get(Number(id));
  if (!voucher) throw new VoucherError('Voucher nahi mila', 404);
  voucher.entries = db.prepare(`SELECT e.*, l.name AS ledger_name, g.name AS group_name
    FROM voucher_entries e JOIN ledgers l ON l.id = e.ledger_id LEFT JOIN groups g ON g.id = l.group_id
    WHERE e.voucher_id = ? ORDER BY e.id`).all(voucher.id);
  voucher.items = db.prepare(`SELECT i.*, s.name AS item_name, u.symbol AS unit_symbol, gw.name AS godown_name
    FROM voucher_items i JOIN stock_items s ON s.id = i.stock_item_id
    LEFT JOIN units u ON u.id = s.unit_id LEFT JOIN godowns gw ON gw.id = i.godown_id
    WHERE i.voucher_id = ? ORDER BY i.id`).all(voucher.id);
  return voucher;
}
