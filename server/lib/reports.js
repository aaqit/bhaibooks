// Reports engine for Tally-like statements with drilldown support.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const rows = (db, sql, params = []) => db.prepare(sql).all(...params);
const one = (db, sql, params = []) => db.prepare(sql).get(...params);

const OPENING_DR = `CASE WHEN l.opening_type = 'Dr' THEN l.opening_balance ELSE 0 END`;
const OPENING_CR = `CASE WHEN l.opening_type = 'Cr' THEN l.opening_balance ELSE 0 END`;

export function groupTree(db) {
  const groups = rows(db, 'SELECT * FROM groups ORDER BY name');
  const byParent = new Map();
  for (const g of groups) {
    const key = g.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  const build = (parentId) => (byParent.get(parentId) || []).map(g => ({ ...g, children: build(g.id) }));
  return build(0);
}

function groupSubtreeIds(db, names) {
  const groups = rows(db, 'SELECT id, name, parent_id FROM groups');
  const set = new Set(groups.filter(g => names.includes(g.name)).map(g => g.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groups) {
      if (g.parent_id && set.has(g.parent_id) && !set.has(g.id)) { set.add(g.id); changed = true; }
    }
  }
  return [...set];
}

function ledgerBalanceMap(db, asOn = null) {
  const params = [];
  let dateFilter = '';
  if (asOn) { dateFilter = 'AND date(v.date) <= date(?)'; params.push(asOn); }
  const totals = rows(db, `SELECT e.ledger_id,
      SUM(CASE WHEN e.entry_type='Dr' THEN e.amount ELSE 0 END) AS dr,
      SUM(CASE WHEN e.entry_type='Cr' THEN e.amount ELSE 0 END) AS cr
    FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
    WHERE 1=1 ${dateFilter}
    GROUP BY e.ledger_id`, params);
  const map = new Map();
  for (const t of totals) map.set(t.ledger_id, { dr: t.dr, cr: t.cr });
  return map;
}

export function daybook(db, from, to) {
  const list = rows(db, `SELECT v.id, v.number, v.type, v.date, v.total, v.taxable, v.cgst, v.sgst, v.igst,
      v.roundoff, v.narration, v.created_by_name,
      COALESCE(p.name, fl.name, tl.name) AS account_name,
      p.name AS party_name, fl.name AS from_name, tl.name AS to_name,
      (SELECT COUNT(*) FROM voucher_items i WHERE i.voucher_id = v.id) AS item_count
    FROM vouchers v
    LEFT JOIN ledgers p ON p.id = v.party_ledger_id
    LEFT JOIN ledgers fl ON fl.id = v.from_ledger_id
    LEFT JOIN ledgers tl ON tl.id = v.to_ledger_id
    WHERE date(v.date) BETWEEN date(?) AND date(?)
    ORDER BY date(v.date), v.id`, [from, to]);
  return { from, to, list };
}

export function ledgerStatement(db, ledgerId, from, to) {
  const ledger = one(db, `SELECT l.*, g.name AS group_name,
      ${OPENING_DR} AS opening_dr, ${OPENING_CR} AS opening_cr
    FROM ledgers l LEFT JOIN groups g ON g.id = l.group_id WHERE l.id = ?`, [Number(ledgerId)]);
  if (!ledger) { const e = new Error('Ledger nahi mila'); e.status = 404; throw e; }

  const before = one(db, `SELECT
      SUM(CASE WHEN e.entry_type='Dr' THEN e.amount ELSE 0 END) AS dr,
      SUM(CASE WHEN e.entry_type='Cr' THEN e.amount ELSE 0 END) AS cr
    FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
    WHERE e.ledger_id = ? AND date(v.date) < date(?)`, [ledger.id, from]);
  const openingSigned = round2(ledger.opening_dr - ledger.opening_cr + (before?.dr || 0) - (before?.cr || 0));

  const entries = rows(db, `SELECT e.voucher_id, v.number, v.type, v.date, v.narration AS voucher_narration,
      e.entry_type, e.amount, e.narration,
      COALESCE(p.name, fl.name, tl.name) AS account_name
    FROM voucher_entries e
    JOIN vouchers v ON v.id = e.voucher_id
    LEFT JOIN ledgers p ON p.id = v.party_ledger_id
    LEFT JOIN ledgers fl ON fl.id = v.from_ledger_id
    LEFT JOIN ledgers tl ON tl.id = v.to_ledger_id
    WHERE e.ledger_id = ? AND date(v.date) BETWEEN date(?) AND date(?)
    ORDER BY date(v.date), v.id, e.id`, [ledger.id, from, to]);

  let running = openingSigned, totalDr = 0, totalCr = 0;
  const lines = entries.map(row => {
    if (row.entry_type === 'Dr') { running += row.amount; totalDr += row.amount; }
    else { running -= row.amount; totalCr += row.amount; }
    return {
      ...row,
      dr: row.entry_type === 'Dr' ? row.amount : 0,
      cr: row.entry_type === 'Cr' ? row.amount : 0,
      balance: round2(running), balanceType: running >= 0 ? 'Dr' : 'Cr',
    };
  });

  return {
    ledger: { id: ledger.id, name: ledger.name, group_name: ledger.group_name, gstin: ledger.gstin },
    from, to,
    opening: { amount: round2(Math.abs(openingSigned)), type: openingSigned >= 0 ? 'Dr' : 'Cr' },
    lines,
    totals: { dr: round2(totalDr), cr: round2(totalCr) },
    closing: { amount: round2(Math.abs(running)), type: running >= 0 ? 'Dr' : 'Cr', signed: round2(running) },
  };
}

export function trialBalance(db, asOn) {
  const ledgers = rows(db, `SELECT l.id, l.name, l.opening_balance, l.opening_type, l.group_id,
      g.name AS group_name, g.category, g.nature,
      ${OPENING_DR} AS opening_dr, ${OPENING_CR} AS opening_cr
    FROM ledgers l JOIN groups g ON g.id = l.group_id
    WHERE l.is_active = 1 ORDER BY g.name, l.name`);
  const move = ledgerBalanceMap(db, asOn);

  let totalDr = 0, totalCr = 0;
  const out = ledgers.map(l => {
    const m = move.get(l.id) || { dr: 0, cr: 0 };
    const net = l.opening_dr - l.opening_cr + m.dr - m.cr;
    const debit = net > 0 ? round2(net) : 0;
    const credit = net < 0 ? round2(-net) : 0;
    totalDr += debit; totalCr += credit;
    return { ...l, movement_dr: round2(m.dr), movement_cr: round2(m.cr), debit, credit, balance: round2(net) };
  });

  // Group the ledger rows into the hierarchy so the UI can drill down.
  const groups = rows(db, 'SELECT * FROM groups ORDER BY name');
  const children = new Map();
  for (const g of groups) {
    const key = g.parent_id || 0;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(g);
  }
  const buildGroup = (g) => {
    const kids = (children.get(g.id) || []).map(buildGroup);
    const own = out.filter(l => l.group_id === g.id);
    const all = [...kids.flatMap(k => k.ledgers), ...own];
    return {
      id: g.id, name: g.name, category: g.category, nature: g.nature,
      debit: round2(all.reduce((s, l) => s + l.debit, 0)),
      credit: round2(all.reduce((s, l) => s + l.credit, 0)),
      ledgers: own, children: kids,
    };
  };
  const tree = (children.get(0) || []).map(buildGroup);
  return { asOn, tree, rows: out, totalDr: round2(totalDr), totalCr: round2(totalCr), difference: round2(totalDr - totalCr), balanced: Math.abs(totalDr - totalCr) < 0.01 };
}

export function profitLoss(db, from, to) {
  const ledgers = rows(db, `SELECT l.id, l.name, l.group_id, g.name AS group_name, g.category,
      COALESCE((SELECT SUM(e.amount) FROM voucher_entries e JOIN vouchers v ON v.id=e.voucher_id WHERE e.ledger_id=l.id AND e.entry_type='Dr' AND date(v.date) BETWEEN date(?) AND date(?)),0) AS dr,
      COALESCE((SELECT SUM(e.amount) FROM voucher_entries e JOIN vouchers v ON v.id=e.voucher_id WHERE e.ledger_id=l.id AND e.entry_type='Cr' AND date(v.date) BETWEEN date(?) AND date(?)),0) AS cr
    FROM ledgers l JOIN groups g ON g.id=l.group_id
    WHERE g.category IN ('DIRECT_INCOME','DIRECT_EXPENSE','INDIRECT_INCOME','INDIRECT_EXPENSE') AND l.is_active=1
    ORDER BY g.category, l.name`, [from, to, from, to]);

  const mk = (l) => {
    const income = l.category.endsWith('INCOME');
    const net = income ? l.cr - l.dr : l.dr - l.cr;
    return { id: l.id, name: l.name, group_name: l.group_name, category: l.category, amount: round2(Math.abs(net)), side: net >= 0 ? (income ? 'Cr' : 'Dr') : (income ? 'Dr' : 'Cr'), signed: round2(income ? net : -net) };
  };
  const all = ledgers.map(mk);
  const sum = (cat) => round2(all.filter(x => x.category === cat).reduce((s, x) => s + x.amount, 0));
  const directIncome = sum('DIRECT_INCOME');
  const directExpense = sum('DIRECT_EXPENSE');
  const indirectIncome = sum('INDIRECT_INCOME');
  const indirectExpense = sum('INDIRECT_EXPENSE');
  const grossProfit = round2(directIncome - directExpense);
  const netProfit = round2(grossProfit + indirectIncome - indirectExpense);

  return {
    from, to,
    directIncome: all.filter(x => x.category === 'DIRECT_INCOME'),
    directExpense: all.filter(x => x.category === 'DIRECT_EXPENSE'),
    indirectIncome: all.filter(x => x.category === 'INDIRECT_INCOME'),
    indirectExpense: all.filter(x => x.category === 'INDIRECT_EXPENSE'),
    totals: { directIncome, directExpense, indirectIncome, indirectExpense, grossProfit, netProfit },
    grossProfit, netProfit,
  };
}

export function balanceSheet(db, asOn) {
  const ledgers = rows(db, `SELECT l.id, l.name, l.group_id, g.name AS group_name, g.category,
      ${OPENING_DR} AS opening_dr, ${OPENING_CR} AS opening_cr
    FROM ledgers l JOIN groups g ON g.id=l.group_id
    WHERE g.category IN ('ASSET','LIABILITY','EQUITY') AND l.is_active=1 ORDER BY g.category, l.name`);
  const move = ledgerBalanceMap(db, asOn);

  const assets = [], liabilities = [];
  for (const l of ledgers) {
    const m = move.get(l.id) || { dr: 0, cr: 0 };
    const net = l.opening_dr - l.opening_cr + m.dr - m.cr;
    const row = { id: l.id, name: l.name, group_name: l.group_name, amount: round2(Math.abs(net)), side: net >= 0 ? 'Dr' : 'Cr' };
    if (l.category === 'ASSET') {
      if (net >= 0) assets.push(row);
      else liabilities.push({ ...row, name: `${l.name} (overdrawn)` });
    } else {
      if (net <= 0) liabilities.push(row);
      else assets.push({ ...row, name: `${l.name} (Dr balance)` });
    }
  }

  // Profit for the running period is added to the liability side (owner's equity).
  const fyStart = one(db, `SELECT value FROM settings WHERE key='books_from'`)?.value || `${asOn.slice(0, 4)}-04-01`;
  const pl = profitLoss(db, fyStart, asOn);
  if (pl.netProfit !== 0) {
    const plRow = { id: 'PL', name: 'Profit & Loss A/c (current period)', group_name: 'Equity', amount: round2(Math.abs(pl.netProfit)), side: pl.netProfit >= 0 ? 'Cr' : 'Dr' };
    // Profit increases liabilities/equity; a loss is a debit balance and sits on the asset side.
    if (pl.netProfit > 0) liabilities.push(plRow); else assets.push(plRow);
  }

  const totalAssets = round2(assets.reduce((s, x) => s + x.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, x) => s + x.amount, 0));
  return { asOn, assets, liabilities, totalAssets, totalLiabilities, difference: round2(totalAssets - totalLiabilities), netProfit: pl.netProfit };
}

// FIFO layers + Last Purchase Price nikalne ke liye item-wise timeline.
function valuationMaps(db) {
  const timeline = rows(db, `SELECT i.stock_item_id, i.qty, i.amount, v.type
    FROM voucher_items i JOIN vouchers v ON v.id = i.voucher_id
    ORDER BY date(v.date), v.id, i.id`);

  const layers = new Map();
  for (const o of rows(db, 'SELECT id, opening_qty, opening_rate FROM stock_items')) {
    layers.set(o.id, o.opening_qty > 0 ? [{ qty: o.opening_qty, rate: o.opening_rate }] : []);
  }
  const lpp = new Map();

  for (const t of timeline) {
    if (!layers.has(t.stock_item_id)) layers.set(t.stock_item_id, []);
    const inward = t.type === 'PURCHASE' || t.type === 'CREDIT_NOTE';
    const outward = t.type === 'SALES' || t.type === 'DEBIT_NOTE';
    if (inward) {
      const rate = t.qty ? t.amount / t.qty : 0;
      if (t.type === 'PURCHASE') lpp.set(t.stock_item_id, round2(rate));
      layers.get(t.stock_item_id).push({ qty: t.qty, rate });
    } else if (outward) {
      let need = t.qty;
      const ls = layers.get(t.stock_item_id);
      while (need > 0.0001 && ls.length) {
        const take = Math.min(ls[0].qty, need);
        ls[0].qty = round2(ls[0].qty - take);
        need = round2(need - take);
        if (ls[0].qty <= 0.0001) ls.shift();
      }
    }
  }

  const fifoValue = new Map(), fifoRate = new Map();
  for (const [itemId, ls] of layers) {
    const qty = round2(ls.reduce((s, l) => s + l.qty, 0));
    const value = round2(ls.reduce((s, l) => s + l.qty * l.rate, 0));
    fifoValue.set(itemId, value);
    fifoRate.set(itemId, qty > 0 ? round2(value / qty) : 0);
  }
  return { fifoValue, fifoRate, lpp };
}

export function stockSummary(db, opts = {}) {
  const asked = String(opts.method || '').toUpperCase();
  const method = ['FIFO', 'LPP'].includes(asked) ? asked : 'AVERAGE';

  const items = rows(db, `SELECT s.id, s.name, s.hsn, s.gst_rate, s.opening_qty, s.opening_rate, s.reorder_level,
      s.sale_price, s.purchase_price, u.symbol AS unit, g.name AS group_name,
      COALESCE((SELECT SUM(i.qty) FROM voucher_items i JOIN vouchers v ON v.id=i.voucher_id WHERE i.stock_item_id=s.id AND v.type IN ('PURCHASE','CREDIT_NOTE')),0) AS in_qty,
      COALESCE((SELECT SUM(i.qty) FROM voucher_items i JOIN vouchers v ON v.id=i.voucher_id WHERE i.stock_item_id=s.id AND v.type IN ('SALES','DEBIT_NOTE')),0) AS out_qty,
      COALESCE((SELECT SUM(i.amount) FROM voucher_items i JOIN vouchers v ON v.id=i.voucher_id WHERE i.stock_item_id=s.id AND v.type='PURCHASE'),0) AS purchase_value
    FROM stock_items s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN stock_groups g ON g.id=s.stock_group_id
    WHERE s.is_active=1 ORDER BY s.name`);

  const val = valuationMaps(db);

  const list = items.map(s => {
    const qty = round2(s.opening_qty + s.in_qty - s.out_qty);
    const avgRate = s.opening_qty + s.in_qty > 0
      ? (s.opening_qty * s.opening_rate + s.purchase_value) / (s.opening_qty + s.in_qty)
      : s.purchase_price;
    let rate = avgRate;
    if (method === 'FIFO') {
      const fifoR = val.fifoRate.get(s.id) || 0;
      rate = fifoR > 0 ? fifoR : avgRate;
    } else if (method === 'LPP') {
      rate = val.lpp.get(s.id) || s.purchase_price || avgRate;
    }
    return {
      ...s, closing_qty: qty, avg_rate: round2(avgRate), rate: round2(rate), valuation: method,
      value: round2(qty * rate),
      low_stock: s.reorder_level > 0 && qty <= s.reorder_level,
      opening_value: round2(s.opening_qty * s.opening_rate),
    };
  });

  return {
    method,
    items: list,
    totalValue: round2(list.reduce((s, x) => s + x.value, 0)),
    totalQty: round2(list.reduce((s, x) => s + x.closing_qty, 0)),
    lowStock: list.filter(x => x.low_stock),
  };
}

// Batch + expiry tracking report (sirf un items par jinke voucher me expiry date daali gayi hai).
export function expiryAlerts(db, asOn, days = 30) {
  const list = rows(db, `SELECT i.stock_item_id, COALESCE(NULLIF(TRIM(i.batch_no),''),'-') AS batch_no,
      COALESCE(i.expiry_date,'') AS expiry_date, COALESCE(s.name,'(deleted item)') AS item_name,
      u.symbol AS unit, COALESCE(s.purchase_price,0) AS purchase_price,
      SUM(CASE WHEN v.type IN ('PURCHASE','CREDIT_NOTE') THEN i.qty ELSE 0 END) AS in_qty,
      SUM(CASE WHEN v.type IN ('SALES','DEBIT_NOTE') THEN i.qty ELSE 0 END) AS out_qty,
      SUM(CASE WHEN v.type IN ('PURCHASE','CREDIT_NOTE') THEN i.amount ELSE 0 END) AS in_value
    FROM voucher_items i JOIN vouchers v ON v.id = i.voucher_id
    LEFT JOIN stock_items s ON s.id = i.stock_item_id
    LEFT JOIN units u ON u.id = s.unit_id
    WHERE COALESCE(i.expiry_date,'') <> ''
    GROUP BY i.stock_item_id, batch_no, expiry_date
    ORDER BY date(expiry_date)`);

  const dayMs = 86400000;
  const items = list.map(r => {
    const qty = round2(r.in_qty - r.out_qty);
    const rate = r.in_qty > 0 ? round2(r.in_value / r.in_qty) : r.purchase_price;
    const daysLeft = Math.round((new Date(`${r.expiry_date}T00:00:00Z`) - new Date(`${asOn}T00:00:00Z`)) / dayMs);
    const status = daysLeft < 0 ? 'EXPIRED' : daysLeft <= days ? 'NEAR_EXPIRY' : 'OK';
    return { ...r, qty, rate, value: round2(qty * rate), days_left: daysLeft, status };
  }).filter(r => r.qty > 0);

  const order = { EXPIRED: 0, NEAR_EXPIRY: 1, OK: 2 };
  items.sort((a, b) => (order[a.status] - order[b.status]) || (a.days_left - b.days_left) || a.item_name.localeCompare(b.item_name));

  return {
    asOn, alertDays: days, items,
    expired: items.filter(i => i.status === 'EXPIRED'),
    nearExpiry: items.filter(i => i.status === 'NEAR_EXPIRY'),
    expiredValue: round2(items.filter(i => i.status === 'EXPIRED').reduce((s, x) => s + x.value, 0)),
  };
}

// Bill-by-bill (invoice-wise) outstanding — receivable ya payable.
export function billWiseOutstanding(db, asOn, opts = {}) {
  const payable = opts.type === 'payable';
  const type = payable ? 'payable' : 'receivable';
  const groupIds = groupSubtreeIds(db, [payable ? 'Sundry Creditors' : 'Sundry Debtors']);
  if (!groupIds.length) return { asOn, type, parties: [], totalPending: 0 };

  const ph = groupIds.map(() => '?').join(',');
  const parties = rows(db, `SELECT id, name, gstin, phone, credit_limit, credit_days
    FROM ledgers WHERE group_id IN (${ph}) AND is_active = 1 ORDER BY name`, groupIds);

  const billType = payable ? 'PURCHASE' : 'SALES';
  const settleTypes = payable ? ['PAYMENT', 'DEBIT_NOTE'] : ['RECEIPT', 'CREDIT_NOTE'];
  const settlePh = settleTypes.map(() => '?').join(',');

  const out = [];
  let grand = 0;
  for (const p of parties) {
    const bills = rows(db, `SELECT id, number, date, total, due_date FROM vouchers
      WHERE party_ledger_id = ? AND type = ? AND date(date) <= date(?) ORDER BY date(date), id`, [p.id, billType, asOn]);
    if (!bills.length) continue;

    const ids = bills.map(b => b.id);
    const settledMap = new Map(rows(db, `SELECT ref_voucher_id, SUM(total) AS amt FROM vouchers
      WHERE ref_voucher_id IN (${ids.map(() => '?').join(',')}) GROUP BY ref_voucher_id`, ids)
      .map(r => [r.ref_voucher_id, r.amt]));
    const onAccount = round2(one(db, `SELECT COALESCE(SUM(total),0) AS amt FROM vouchers
      WHERE party_ledger_id = ? AND type IN (${settlePh}) AND (ref_voucher_id IS NULL OR ref_voucher_id = 0)
        AND date(date) <= date(?)`, [p.id, ...settleTypes, asOn])?.amt || 0);

    let partyPending = 0;
    const billRows = bills.map(b => {
      const settled = round2(Math.min(settledMap.get(b.id) || 0, b.total));
      const pending = round2(b.total - settled);
      partyPending = round2(partyPending + pending);
      const overdueDays = b.due_date && b.due_date < asOn
        ? Math.round((new Date(`${asOn}T00:00:00Z`) - new Date(`${b.due_date}T00:00:00Z`)) / 86400000) : 0;
      return { ...b, settled, pending, overdue_days: overdueDays, overdue: overdueDays > 0 };
    });

    out.push({
      id: p.id, name: p.name, gstin: p.gstin, phone: p.phone,
      credit_limit: p.credit_limit, credit_days: p.credit_days,
      bills: billRows, pending: partyPending, on_account: onAccount,
      total: round2(partyPending + onAccount),
      overdue: round2(billRows.filter(b => b.overdue).reduce((s, b) => s + b.pending, 0)),
    });
    grand = round2(grand + partyPending + onAccount);
  }

  out.sort((a, b) => b.total - a.total);
  return { asOn, type, parties: out, totalPending: grand };
}

export function gstSummary(db, from, to) {
  const outward = one(db, `SELECT COALESCE(SUM(taxable),0) taxable, COALESCE(SUM(cgst),0) cgst,
      COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(total),0) total, COUNT(*) cnt
    FROM vouchers WHERE type IN ('SALES') AND date(date) BETWEEN date(?) AND date(?)`, [from, to]);
  const creditNotes = one(db, `SELECT COALESCE(SUM(taxable),0) taxable, COALESCE(SUM(cgst),0) cgst,
      COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(total),0) total, COUNT(*) cnt
    FROM vouchers WHERE type='CREDIT_NOTE' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]);
  const inward = one(db, `SELECT COALESCE(SUM(taxable),0) taxable, COALESCE(SUM(cgst),0) cgst,
      COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(total),0) total, COUNT(*) cnt
    FROM vouchers WHERE type='PURCHASE' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]);
  const debitNotes = one(db, `SELECT COALESCE(SUM(taxable),0) taxable, COALESCE(SUM(cgst),0) cgst,
      COALESCE(SUM(sgst),0) sgst, COALESCE(SUM(igst),0) igst, COALESCE(SUM(total),0) total, COUNT(*) cnt
    FROM vouchers WHERE type='DEBIT_NOTE' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]);

  const net = (a, b, key) => round2((a?.[key] || 0) - (b?.[key] || 0));
  const outTaxable = net(outward, creditNotes, 'taxable');
  const outCgst = net(outward, creditNotes, 'cgst');
  const outSgst = net(outward, creditNotes, 'sgst');
  const outIgst = net(outward, creditNotes, 'igst');
  const itcTaxable = net(inward, debitNotes, 'taxable');
  const itcCgst = net(inward, debitNotes, 'cgst');
  const itcSgst = net(inward, debitNotes, 'sgst');
  const itcIgst = net(inward, debitNotes, 'igst');
  const netTax = round2(outCgst + outSgst + outIgst - itcCgst - itcSgst - itcIgst);

  return {
    period: { from, to },
    outward: { taxable: outTaxable, cgst: outCgst, sgst: outSgst, igst: outIgst, total: round2(outCgst + outSgst + outIgst), invoices: outward?.cnt || 0 },
    creditNotes: { taxable: creditNotes?.taxable || 0, cgst: creditNotes?.cgst || 0, sgst: creditNotes?.sgst || 0, igst: creditNotes?.igst || 0, total: creditNotes?.total || 0, count: creditNotes?.cnt || 0 },
    itc: { taxable: itcTaxable, cgst: itcCgst, sgst: itcSgst, igst: itcIgst, total: round2(itcCgst + itcSgst + itcIgst), invoices: inward?.cnt || 0 },
    debitNotes: { total: debitNotes?.total || 0, count: debitNotes?.cnt || 0 },
    netTax,
    payable: netTax > 0,
    cashPayable: Math.max(0, round2(netTax)),
    excessItc: Math.max(0, round2(-netTax)),
  };
}

export function gstr1(db, from, to) {
  const invoices = rows(db, `SELECT v.id, v.number, v.date, v.total, v.taxable, v.cgst, v.sgst, v.igst,
      v.place_of_supply, p.name AS party_name, COALESCE(p.gstin,'') AS gstin, COALESCE(p.state,'') AS state
    FROM vouchers v LEFT JOIN ledgers p ON p.id = v.party_ledger_id
    WHERE v.type='SALES' AND date(v.date) BETWEEN date(?) AND date(?)
    ORDER BY v.date, v.id`, [from, to]);

  const b2b = invoices.filter(i => i.gstin);
  const b2c = invoices.filter(i => !i.gstin);

  const grouped = new Map();
  for (const inv of invoices) {
    const section = inv.gstin ? 'B2B' : inv.total > 250000 ? 'B2CL' : 'B2CS';
    const items = rows(db, `SELECT gst_rate, SUM(i.amount) taxable, SUM(i.cgst) cgst, SUM(i.sgst) sgst, SUM(i.igst) igst
      FROM voucher_items i WHERE i.voucher_id=? GROUP BY gst_rate`, [inv.id]);
    for (const it of items) {
      const key = `${section}|${it.gst_rate}|${it.igst > 0 ? 'IGST' : 'CGST_SGST'}`;
      if (!grouped.has(key)) grouped.set(key, { section, rate: it.gst_rate, type: it.igst > 0 ? 'IGST' : 'CGST_SGST', taxable: 0, cgst: 0, sgst: 0, igst: 0, invoices: 0 });
      const g = grouped.get(key);
      g.taxable = round2(g.taxable + it.taxable);
      g.cgst = round2(g.cgst + it.cgst);
      g.sgst = round2(g.sgst + it.sgst);
      g.igst = round2(g.igst + it.igst);
      g.invoices += 1;
    }
  }

  const hsn = rows(db, `SELECT i.hsn, COALESCE(NULLIF(i.hsn,''),'NA') AS hsn_code, s.name AS item_name,
      u.symbol AS unit, SUM(i.qty) qty, i.gst_rate, SUM(i.amount) taxable, SUM(i.cgst) cgst, SUM(i.sgst) sgst, SUM(i.igst) igst
    FROM voucher_items i JOIN vouchers v ON v.id=i.voucher_id
    LEFT JOIN stock_items s ON s.id=i.stock_item_id LEFT JOIN units u ON u.id=s.unit_id
    WHERE v.type='SALES' AND date(v.date) BETWEEN date(?) AND date(?) GROUP BY i.stock_item_id, i.hsn, i.gst_rate
    ORDER BY i.hsn`, [from, to]);

  const creditNotes = rows(db, `SELECT v.number, v.date, v.total, v.taxable, v.cgst, v.sgst, v.igst, p.name AS party_name, COALESCE(p.gstin,'') AS gstin
    FROM vouchers v LEFT JOIN ledgers p ON p.id=v.party_ledger_id
    WHERE v.type='CREDIT_NOTE' AND date(v.date) BETWEEN date(?) AND date(?) ORDER BY v.date`, [from, to]);

  return {
    period: { from, to },
    b2b, b2c, summary: [...grouped.values()], hsn, creditNotes,
    totals: {
      taxable: round2(invoices.reduce((s, i) => s + i.taxable, 0)),
      cgst: round2(invoices.reduce((s, i) => s + i.cgst, 0)),
      sgst: round2(invoices.reduce((s, i) => s + i.sgst, 0)),
      igst: round2(invoices.reduce((s, i) => s + i.igst, 0)),
      invoiceCount: invoices.length,
    },
  };
}

export function brs(db, ledgerId, asOn) {
  const ledger = one(db, `SELECT * FROM ledgers WHERE id = ?`, [Number(ledgerId)]);
  if (!ledger) { const e = new Error('Bank ledger nahi mila'); e.status = 404; throw e; }
  const entries = rows(db, `SELECT e.voucher_id, v.number, v.type, v.date, v.narration,
      e.entry_type, e.amount, COALESCE(b.reconciled,0) AS reconciled, COALESCE(b.bank_date,'') AS bank_date
    FROM voucher_entries e JOIN vouchers v ON v.id=e.voucher_id
    LEFT JOIN brs_entries b ON b.voucher_id=e.voucher_id AND b.ledger_id=e.ledger_id
    WHERE e.ledger_id=? AND date(v.date) <= date(?)
    ORDER BY date(v.date), v.id`, [Number(ledgerId), asOn]);

  let bookDr = 0, bookCr = 0, recDr = 0, recCr = 0, uncleared = 0;
  const lines = entries.map(row => {
    const dr = row.entry_type === 'Dr' ? row.amount : 0;
    const cr = row.entry_type === 'Cr' ? row.amount : 0;
    bookDr += dr; bookCr += cr;
    if (row.reconciled) { recDr += dr; recCr += cr; } else uncleared += 1;
    return { ...row, dr, cr, reconciled: !!row.reconciled };
  });
  const opening = round2((ledger.opening_type === 'Dr' ? ledger.opening_balance : 0) - (ledger.opening_type === 'Cr' ? ledger.opening_balance : 0));
  return {
    ledger: { id: ledger.id, name: ledger.name, bank_name: ledger.bank_name, account_no: ledger.account_no },
    asOn, lines,
    opening,
    bookBalance: round2(opening + bookDr - bookCr),
    reconciledBalance: round2(opening + recDr - recCr),
    unclearedCount: uncleared,
    totals: { dr: round2(bookDr), cr: round2(bookCr), recDr: round2(recDr), recCr: round2(recCr) },
  };
}

const shiftDay = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function cashBankLedgers(db) {
  const groupIds = groupSubtreeIds(db, ['Cash-in-Hand', 'Bank Accounts']);
  if (!groupIds.length) return [];
  const ph = groupIds.map(() => '?').join(',');
  return rows(db, `SELECT l.id, l.name, g.name AS group_name
    FROM ledgers l JOIN groups g ON g.id = l.group_id
    WHERE l.group_id IN (${ph}) AND l.is_active = 1`, groupIds);
}

// Ledger ka signed (Dr positive) balance di gayi date se pehle tak.
function signedBalanceBefore(db, ledgerId, date) {
  const l = one(db, 'SELECT opening_balance, opening_type FROM ledgers WHERE id = ?', [Number(ledgerId)]);
  if (!l) return 0;
  const mv = one(db, `SELECT COALESCE(SUM(CASE WHEN e.entry_type='Dr' THEN e.amount ELSE -e.amount END),0) AS net
    FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
    WHERE e.ledger_id = ? AND date(v.date) < date(?)`, [Number(ledgerId), date]);
  return round2((l.opening_type === 'Dr' ? l.opening_balance : -l.opening_balance) + (mv?.net || 0));
}

const CF_GROUPS = {
  RECEIPT: 'Customer Receipts',
  PAYMENT: 'Supplier & Expense Payments',
  CONTRA: 'Cash / Bank Transfer',
  SALES: 'Cash / Bank Sales',
  PURCHASE: 'Cash / Bank Purchases',
  CREDIT_NOTE: 'Sales Returns (Credit Note)',
  DEBIT_NOTE: 'Purchase Returns (Debit Note)',
  JOURNAL: 'Journal Adjustment',
};

export function cashFlow(db, from, to) {
  const ledgers = cashBankLedgers(db);
  const cashIds = ledgers.filter(l => l.group_name === 'Cash-in-Hand').map(l => l.id);
  const bankIds = ledgers.filter(l => l.group_name !== 'Cash-in-Hand').map(l => l.id);

  const sumBefore = (ids, date) => round2(ids.reduce((s, id) => s + signedBalanceBefore(db, id, date), 0));
  const openingCash = sumBefore(cashIds, from);
  const openingBank = sumBefore(bankIds, from);

  let lines = [];
  if (ledgers.length) {
    const ph = ledgers.map(() => '?').join(',');
    lines = rows(db, `SELECT v.id AS voucher_id, v.number, v.type, v.date, v.narration,
        e.entry_type, e.amount, e.ledger_id,
        (SELECT COALESCE(l2.name,'') FROM voucher_entries e2 JOIN ledgers l2 ON l2.id = e2.ledger_id
           WHERE e2.voucher_id = v.id AND e2.ledger_id <> e.ledger_id ORDER BY e2.id LIMIT 1) AS counterparty
      FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
      WHERE e.ledger_id IN (${ph}) AND date(v.date) BETWEEN date(?) AND date(?)
      ORDER BY date(v.date), v.id, e.id`, [...ledgers.map(l => l.id), from, to]);
  }

  const bucket = new Map();
  for (const ln of lines) {
    const category = CF_GROUPS[ln.type] || 'Other Adjustments';
    const key = `${category}|${ln.entry_type}`;
    if (!bucket.has(key)) bucket.set(key, { category, entry_type: ln.entry_type, amount: 0, count: 0 });
    const b = bucket.get(key);
    b.amount = round2(b.amount + ln.amount);
    b.count += 1;
  }

  const all = [...bucket.values()];
  const inflow = all.filter(x => x.entry_type === 'Dr').sort((a, b) => b.amount - a.amount);
  const outflow = all.filter(x => x.entry_type === 'Cr').sort((a, b) => b.amount - a.amount);
  const totalIn = round2(inflow.reduce((s, x) => s + x.amount, 0));
  const totalOut = round2(outflow.reduce((s, x) => s + x.amount, 0));

  const closingCash = sumBefore(cashIds, shiftDay(to, 1));
  const closingBank = sumBefore(bankIds, shiftDay(to, 1));

  return {
    from, to,
    opening: { cash: openingCash, bank: openingBank, total: round2(openingCash + openingBank) },
    inflow, outflow, totalIn, totalOut,
    netChange: round2(totalIn - totalOut),
    closing: { cash: closingCash, bank: closingBank, total: round2(closingCash + closingBank) },
    lines,
  };
}

export function fundsFlow(db, from, to) {
  const ledgers = rows(db, `SELECT l.id, l.name, g.category, g.name AS group_name
    FROM ledgers l JOIN groups g ON g.id = l.group_id
    WHERE g.category IN ('ASSET','LIABILITY','EQUITY') AND l.is_active = 1`);

  const sources = [], applications = [];
  for (const l of ledgers) {
    const opening = signedBalanceBefore(db, l.id, from);
    const closing = signedBalanceBefore(db, l.id, shiftDay(to, 1));
    const change = round2(closing - opening);
    if (Math.abs(change) < 0.01) continue;
    // Dr-positive convention: change<0 = funds ka source (asset kam / liability badhi), change>0 = application.
    const item = { id: l.id, name: l.name, group_name: l.group_name, opening, closing, change: round2(Math.abs(change)) };
    (change < 0 ? sources : applications).push(item);
  }

  const pl = profitLoss(db, from, to);
  if (pl.netProfit >= 0.01) sources.unshift({ id: 'PL', name: 'Profit for the period', group_name: 'Equity', change: round2(pl.netProfit) });
  else if (pl.netProfit <= -0.01) applications.unshift({ id: 'PL', name: 'Loss for the period', group_name: 'Equity', change: round2(Math.abs(pl.netProfit)) });

  const cashIds = cashBankLedgers(db).map(l => l.id);
  const cashOpening = round2(cashIds.reduce((s, id) => s + signedBalanceBefore(db, id, from), 0));
  const cashClosing = round2(cashIds.reduce((s, id) => s + signedBalanceBefore(db, id, shiftDay(to, 1)), 0));

  return {
    from, to,
    sources: sources.sort((a, b) => b.change - a.change),
    applications: applications.sort((a, b) => b.change - a.change),
    totalSources: round2(sources.reduce((s, x) => s + x.change, 0)),
    totalApplications: round2(applications.reduce((s, x) => s + x.change, 0)),
    netProfit: pl.netProfit,
    cashOpening, cashClosing, cashChange: round2(cashClosing - cashOpening),
  };
}

export function dashboard(db, from, to, seriesFrom) {
  const sales = one(db, `SELECT COALESCE(SUM(total),0) amt, COUNT(*) cnt FROM vouchers WHERE type='SALES' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || {};
  const purchases = one(db, `SELECT COALESCE(SUM(total),0) amt, COUNT(*) cnt FROM vouchers WHERE type='PURCHASE' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || {};
  const receipts = one(db, `SELECT COALESCE(SUM(total),0) amt FROM vouchers WHERE type='RECEIPT' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || {};
  const payments = one(db, `SELECT COALESCE(SUM(total),0) amt FROM vouchers WHERE type='PAYMENT' AND date(date) BETWEEN date(?) AND date(?)`, [from, to]) || {};
  const stock = stockSummary(db);

  const balances = ledgerBalanceMap(db);
  const ledgers = rows(db, `SELECT l.id, l.name, l.group_id, l.opening_balance, l.opening_type, g.name AS group_name
    FROM ledgers l JOIN groups g ON g.id=l.group_id WHERE l.is_active=1`);

  let debtors = 0, creditors = 0, cashBank = 0;
  const debtorList = [];
  const debtorGroups = groupSubtreeIds(db, ['Sundry Debtors']);
  const creditorGroups = groupSubtreeIds(db, ['Sundry Creditors']);
  const cashGroups = groupSubtreeIds(db, ['Cash-in-Hand', 'Bank Accounts']);
  for (const l of ledgers) {
    const m = balances.get(l.id) || { dr: 0, cr: 0 };
    const signed = (l.opening_type === 'Dr' ? l.opening_balance : -l.opening_balance) + m.dr - m.cr;
    if (debtorGroups.includes(l.group_id)) {
      if (signed > 0) { debtors += signed; debtorList.push({ id: l.id, name: l.name, balance: round2(signed) }); }
    }
    if (creditorGroups.includes(l.group_id) && signed < 0) creditors += -signed;
    if (cashGroups.includes(l.group_id)) cashBank += signed;
  }

  const monthly = rows(db, `SELECT strftime('%Y-%m', date) ym,
      COALESCE(SUM(CASE WHEN type='SALES' THEN total ELSE 0 END),0) sales,
      COALESCE(SUM(CASE WHEN type='PURCHASE' THEN total ELSE 0 END),0) purchases
    FROM vouchers WHERE date(date) >= date(?) GROUP BY ym ORDER BY ym`, [seriesFrom]);

  const recent = rows(db, `SELECT v.id, v.number, v.type, v.date, v.total,
      COALESCE(p.name, fl.name, tl.name) AS account_name
    FROM vouchers v LEFT JOIN ledgers p ON p.id=v.party_ledger_id
    LEFT JOIN ledgers fl ON fl.id=v.from_ledger_id LEFT JOIN ledgers tl ON tl.id=v.to_ledger_id
    ORDER BY v.id DESC LIMIT 8`);

  const gst = gstSummary(db, from, to);

  return {
    period: { from, to },
    sales: { amount: round2(sales.amt || 0), count: sales.cnt || 0 },
    purchases: { amount: round2(purchases.amt || 0), count: purchases.cnt || 0 },
    receipts: { amount: round2(receipts.amt || 0) },
    payments: { amount: round2(payments.amt || 0) },
    receivables: round2(debtors), payables: round2(creditors), cashBank: round2(cashBank),
    stockValue: stock.totalValue, stockItems: stock.items.length, lowStock: stock.lowStock.length,
    gstPayable: gst.cashPayable, gstPeriod: gst.period,
    monthly: monthly.map(m => ({ month: m.ym, sales: round2(m.sales), purchases: round2(m.purchases) })),
    recent, topDebtors: debtorList.sort((a, b) => b.balance - a.balance).slice(0, 5),
  };
}
