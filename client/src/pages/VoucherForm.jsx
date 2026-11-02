import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import {
  Button, Card, ErrorBox, Field, Icon, Loading, PageHeader, SelectInput, TextArea, TextInput, Toggle,
} from '../components/ui.jsx';
import {
  GST_RATES, STATES, VOUCHER_META, fmtNumber, money, plainMoney, todayISO, voucherLabel,
} from '../utils.js';

const ITEM_TYPES = ['SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE'];
const TYPE_LIST = ['SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL', 'CREDIT_NOTE', 'DEBIT_NOTE'];

const TYPE_HINTS = {
  SALES: 'Customer ko maal becha. Party Dr, Sales + GST Cr.',
  PURCHASE: 'Supplier se maal kharida. Purchase + Input GST Dr, Party Cr.',
  PAYMENT: 'Paisa diya. Debit ledger (party/expense) Dr, Cash/Bank Cr.',
  RECEIPT: 'Paisa mila. Cash/Bank Dr, Party/Credit ledger Cr.',
  CONTRA: 'Cash se bank ya bank se cash. Dono side cash/bank ledgers.',
  JOURNAL: 'Adjustment entry. Kam se kam 2 rows, Dr = Cr hona chahiye.',
  CREDIT_NOTE: 'Sales return. Party Cr, Sales + GST Dr, stock wapas in.',
  DEBIT_NOTE: 'Purchase return. Party Dr, Purchase + GST Cr, stock out.',
};

const emptyRow = (gst = 5) => ({
  stock_item_id: '', qty: 1, rate: 0, discount_pct: 0, gst_rate: gst, godown_id: '', batch_no: '', expiry_date: '',
});

const newJournalRow = (entryType = 'Dr') => ({ ledger_id: '', entry_type: entryType, amount: '', narration: '' });

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

export default function VoucherForm() {
  const { type: routeType, id } = useParams();
  const { companyId, companies, hasCap } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isEdit = !!id;
  const company = companies.find(c => c.id === companyId);

  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedVoucher, setSavedVoucher] = useState(null);

  const type = (isEdit ? savedVoucher?.type : routeType) || 'SALES';
  const meta = VOUCHER_META[type] || VOUCHER_META.SALES;
  const isItem = ITEM_TYPES.includes(type);

  const [form, setForm] = useState({
    date: todayISO(),
    party_ledger_id: '',
    place_of_supply: company?.state || 'Gujarat',
    due_date: '',
    narration: '',
    payment_mode: '',
    cheque_no: '',
    cheque_date: '',
    amount: '',
    from_ledger_id: '',
    to_ledger_id: '',
    eway_bill_no: '',
    transport_name: '',
    vehicle_no: '',
    ship_to: '',
    override_credit_limit: false,
    items: [emptyRow()],
    entries: [newJournalRow('Dr'), newJournalRow('Cr')],
  });

  const dateRef = useRef(null);

  const loadBoot = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api('/masters/bootstrap');
      setBoot(data);
      if (isEdit) {
        const { voucher } = await api(`/vouchers/${id}`);
        setSavedVoucher(voucher);
        setForm({
          date: voucher.date,
          party_ledger_id: voucher.party_ledger_id || '',
          place_of_supply: voucher.place_of_supply || data.company?.state || 'Gujarat',
          due_date: voucher.due_date || '',
          narration: voucher.narration || '',
          payment_mode: voucher.payment_mode || '',
          cheque_no: voucher.cheque_no || '',
          cheque_date: voucher.cheque_date || '',
          amount: voucher.total || '',
          from_ledger_id: voucher.from_ledger_id || '',
          to_ledger_id: voucher.to_ledger_id || '',
          eway_bill_no: voucher.eway_bill_no || '',
          transport_name: voucher.transport_name || '',
          vehicle_no: voucher.vehicle_no || '',
          ship_to: voucher.ship_to || '',
          override_credit_limit: false,
          items: voucher.items?.length
            ? voucher.items.map(it => ({
              stock_item_id: it.stock_item_id, qty: it.qty, rate: it.rate, discount_pct: it.discount_pct || 0,
              gst_rate: it.gst_rate || 0, godown_id: it.godown_id || '', batch_no: it.batch_no || '', expiry_date: it.expiry_date || '',
            }))
            : [emptyRow()],
          entries: voucher.entries?.length
            ? voucher.entries.map(e => ({ ledger_id: e.ledger_id, entry_type: e.entry_type, amount: e.amount, narration: e.narration || '' }))
            : [newJournalRow('Dr'), newJournalRow('Cr')],
        });
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = `${meta.label} voucher · BahiBooks`;
    loadBoot();
  }, [companyId, id, routeType]);

  useEffect(() => {
    if (isEdit) return;
    setForm(f => ({
      ...f,
      party_ledger_id: '',
      amount: '',
      from_ledger_id: '',
      to_ledger_id: '',
      eway_bill_no: '',
      transport_name: '',
      vehicle_no: '',
      ship_to: '',
      override_credit_limit: false,
      items: [emptyRow()],
      entries: [newJournalRow('Dr'), newJournalRow('Cr')],
      place_of_supply: company?.state || 'Gujarat',
    }));
    setSavedVoucher(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isEdit]);

  const ledgers = boot?.ledgers || [];
  const items = boot?.stockItems || [];
  const godowns = boot?.godowns || [];

  const ledgersByGroup = useMemo(() => {
    const groups = new Map();
    for (const l of ledgers) {
      const key = l.group_name || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ledgers]);

  const partyLedger = ledgers.find(l => Number(l.id) === Number(form.party_ledger_id));
  const interState = useMemo(() => {
    const supply = String(form.place_of_supply || partyLedger?.state || '').trim().toLowerCase();
    const home = String(boot?.company?.state || company?.state || '').trim().toLowerCase();
    return !!(supply && home && supply !== home);
  }, [form.place_of_supply, partyLedger, boot, company]);

  const totals = useMemo(() => {
    if (!isItem) {
      const amt = round2(form.amount || 0);
      return { taxable: amt, discount: 0, cgst: 0, sgst: 0, igst: 0, roundoff: 0, total: amt, tax: 0, gross: amt };
    }
    let taxable = 0, discount = 0, cgst = 0, sgst = 0, igst = 0, gross = 0, qty = 0;
    for (const row of form.items) {
      const stock = items.find(s => Number(s.id) === Number(row.stock_item_id));
      const q = Number(row.qty) || 0;
      const rate = Number(row.rate) || 0;
      const dp = Math.min(100, Math.max(0, Number(row.discount_pct) || 0));
      const gstRate = Number(row.gst_rate ?? stock?.gst_rate ?? 0) || 0;
      const lineGross = round2(q * rate);
      const lineDiscount = round2((lineGross * dp) / 100);
      const lineTaxable = round2(lineGross - lineDiscount);
      const tax = round2((lineTaxable * gstRate) / 100);
      gross = round2(gross + lineGross);
      discount = round2(discount + lineDiscount);
      taxable = round2(taxable + lineTaxable);
      qty += q;
      if (interState) igst = round2(igst + tax);
      else {
        const c = round2(tax / 2);
        cgst = round2(cgst + c);
        sgst = round2(sgst + (tax - c));
      }
    }
    const tax = round2(cgst + sgst + igst);
    const raw = round2(taxable + tax);
    const total = Math.round(raw);
    return {
      taxable, discount, cgst, sgst, igst, tax, gross: round2(gross), qty: round2(qty),
      roundoff: round2(total - raw), total,
    };
  }, [form.items, form.amount, items, interState, isItem]);

  const journalTotals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const e of form.entries) {
      const amt = round2(e.amount || 0);
      if (e.entry_type === 'Cr') cr += amt; else dr += amt;
    }
    return { dr: round2(dr), cr: round2(cr), diff: round2(dr - cr), balanced: Math.abs(dr - cr) < 0.01 && dr > 0 };
  }, [form.entries]);

  // Soft credit-limit warning (server par actual check hota hai).
  const creditCheck = useMemo(() => {
    if (type !== 'SALES' || !partyLedger) return null;
    const limit = Number(partyLedger.credit_limit) || 0;
    if (limit <= 0) return null;
    const over = totals.total > limit + 0.009;
    return { limit, total: totals.total, over, days: Number(partyLedger.credit_days) || 0, name: partyLedger.name };
  }, [type, partyLedger, totals.total]);

  const updateRow = (index, patch) => {
    setForm(f => ({ ...f, items: f.items.map((r, i) => i === index ? { ...r, ...patch } : r) }));
  };

  const updateEntry = (index, patch) => {
    setForm(f => ({ ...f, entries: f.entries.map((r, i) => i === index ? { ...r, ...patch } : r) }));
  };

  const addRow = () => {
    const last = form.items[form.items.length - 1];
    setForm(f => ({ ...f, items: [...f.items, { ...emptyRow(last?.gst_rate ?? 5), godown_id: last?.godown_id || '' }] }));
  };

  const removeRow = (index) => {
    setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== index) : f.items }));
  };

  const pickItem = (index, stockId) => {
    const stock = items.find(s => Number(s.id) === Number(stockId));
    if (!stock) { updateRow(index, { stock_item_id: '' }); return; }
    const price = type === 'PURCHASE' || type === 'DEBIT_NOTE' ? stock.purchase_price : stock.sale_price;
    updateRow(index, {
      stock_item_id: stock.id,
      rate: price || stock.purchase_price || stock.sale_price || 0,
      gst_rate: stock.gst_rate ?? 5,
    });
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      let body;
      if (isItem) {
        if (!form.party_ledger_id) throw new Error('Party ledger select karo');
        const cleaned = form.items.filter(r => r.stock_item_id && Number(r.qty) > 0);
        if (!cleaned.length) throw new Error('Kam se kam ek item add karo');
        body = {
          type,
          date: form.date,
          party_ledger_id: Number(form.party_ledger_id),
          place_of_supply: form.place_of_supply,
          due_date: form.due_date || '',
          narration: form.narration,
          payment_mode: form.payment_mode,
          eway_bill_no: form.eway_bill_no,
          transport_name: form.transport_name,
          vehicle_no: form.vehicle_no,
          ship_to: form.ship_to,
          override_credit_limit: !!form.override_credit_limit,
          items: cleaned.map(r => ({
            stock_item_id: Number(r.stock_item_id),
            qty: Number(r.qty),
            rate: Number(r.rate),
            discount_pct: Number(r.discount_pct) || 0,
            gst_rate: Number(r.gst_rate) || 0,
            godown_id: r.godown_id ? Number(r.godown_id) : undefined,
            batch_no: r.batch_no || '',
            expiry_date: r.expiry_date || '',
          })),
        };
      } else if (type === 'JOURNAL') {
        const rows = form.entries.filter(r => r.ledger_id && Number(r.amount) > 0);
        if (rows.length < 2) throw new Error('Journal me kam se kam 2 entries chahiye');
        if (!journalTotals.balanced) throw new Error(`Journal balance nahi hai — Dr ${money(journalTotals.dr)} vs Cr ${money(journalTotals.cr)}`);
        body = {
          type, date: form.date, narration: form.narration,
          entries: rows.map(r => ({
            ledger_id: Number(r.ledger_id), entry_type: r.entry_type,
            amount: Number(r.amount), narration: r.narration || '',
          })),
        };
      } else {
        if (!form.from_ledger_id || !form.to_ledger_id) throw new Error('Dono ledgers select karo');
        if (Number(form.from_ledger_id) === Number(form.to_ledger_id)) throw new Error('From aur To ledger same nahi ho sakte');
        if (!(Number(form.amount) > 0)) throw new Error('Amount 0 se zyada hona chahiye');
        body = {
          type, date: form.date, amount: Number(form.amount),
          from_ledger_id: Number(form.from_ledger_id), to_ledger_id: Number(form.to_ledger_id),
          narration: form.narration, payment_mode: form.payment_mode,
          cheque_no: form.cheque_no, cheque_date: form.cheque_date || undefined,
        };
      }

      const res = isEdit
        ? await api(`/vouchers/${id}`, { method: 'PUT', body })
        : await api('/vouchers', { method: 'POST', body });
      toast.success(res.message || 'Voucher save ho gaya');

      if (isEdit) {
        navigate(type === 'SALES' || type === 'DEBIT_NOTE' ? '/daybook' : '/daybook');
        return;
      }
      setSavedVoucher(res.voucher);
      setForm(f => ({
        ...f,
        narration: '',
        amount: '',
        items: [emptyRow()],
        entries: [newJournalRow('Dr'), newJournalRow('Cr')],
      }));
      if (type === 'SALES' || type === 'DEBIT_NOTE') {
        setTimeout(() => {
          const ok = window.confirm(`${res.voucher.number} save ho gaya.\n\nInvoice print / PDF kholna hai?`);
          if (ok) window.open(`/print/voucher/${res.voucher.id}`, '_blank');
        }, 120);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && !e.defaultPrevented) navigate(-1);
  };

  useEffect(() => {
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  });

  if (loading) return <Loading label="Voucher form ready ho raha hai..." />;
  if (error) return <ErrorBox error={error} onRetry={loadBoot} />;
  if (!hasCap('voucher:create')) return <div className="empty">Aapke role ke paas voucher entry ki permission nahi hai.</div>;

  const number = isEdit ? savedVoucher?.number : 'Auto';
  const canSave = !isItem ? (type === 'JOURNAL' ? journalTotals.balanced : true) : true;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={isEdit ? `Edit · ${meta.label}` : `New voucher · ${meta.shortcut}`}
        title={`${meta.label} Voucher`}
        subtitle={TYPE_HINTS[type]}
        actions={(
          <>
            <Button variant="ghost" icon="back" onClick={() => navigate(-1)}>Back</Button>
            {savedVoucher && (type === 'SALES' || type === 'DEBIT_NOTE') && (
              <Button icon="print" onClick={() => window.open(`/print/voucher/${savedVoucher.id}`, '_blank')}>Print invoice</Button>
            )}
            <Button variant="primary" type="button" icon="save" onClick={submit} disabled={saving || !canSave}>
              {saving ? 'Saving...' : 'Save (Ctrl+Enter)'}
            </Button>
          </>
        )}
      />

      {!isEdit && (
        <div className="voucher-tabs">
          {TYPE_LIST.map(t => (
            <button
              key={t}
              type="button"
              className={`voucher-tab ${t === type ? 'active' : ''}`}
              onClick={() => navigate(`/vouchers/new/${t}`)}
            >
              <span>{VOUCHER_META[t].label}</span>
              <kbd>{VOUCHER_META[t].shortcut}</kbd>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="voucher-layout">
        <div className="stack-lg">
          <Card title="Voucher details" subtitle={`${meta.label} · ${number}`}>
            <div className="form-grid-3">
              <Field label="Date">
                <TextInput ref={dateRef} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </Field>
              <Field label="Voucher number">
                <TextInput value={number} readOnly className="readonly" />
              </Field>
              <Field label="Payment mode">
                <SelectInput value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })}>
                  <option value="">—</option>
                  {['Cash', 'UPI', 'Bank Transfer', 'NEFT', 'RTGS', 'Cheque', 'Card', 'Credit'].map(m => <option key={m} value={m}>{m}</option>)}
                </SelectInput>
              </Field>
              {isItem ? (
                <>
                  <Field label={type === 'PURCHASE' || type === 'DEBIT_NOTE' ? 'Supplier' : 'Customer / Party'}>
                    <SelectInput value={form.party_ledger_id} onChange={e => {
                      const ledger = ledgers.find(l => Number(l.id) === Number(e.target.value));
                      setForm({ ...form, party_ledger_id: e.target.value, place_of_supply: ledger?.state || form.place_of_supply });
                    }} required>
                      <option value="">Select party</option>
                      {ledgersByGroup.map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map(l => <option key={l.id} value={l.id}>{l.name}{l.gstin ? ` · ${l.gstin}` : ''}</option>)}
                        </optgroup>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Place of supply">
                    <SelectInput value={form.place_of_supply} onChange={e => setForm({ ...form, place_of_supply: e.target.value })}>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="Due date">
                    <TextInput type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={type === 'RECEIPT' ? 'Credit ledger (party / income)' : type === 'CONTRA' ? 'From ledger (source)' : 'From ledger (credit)'}>
                    <SelectInput value={form.from_ledger_id} onChange={e => setForm({ ...form, from_ledger_id: e.target.value })} required>
                      <option value="">Select ledger</option>
                      {ledgersByGroup.map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </optgroup>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label={type === 'RECEIPT' ? 'Debit ledger (cash / bank)' : type === 'CONTRA' ? 'To ledger (destination)' : 'To ledger (debit)'}>
                    <SelectInput value={form.to_ledger_id} onChange={e => setForm({ ...form, to_ledger_id: e.target.value })} required>
                      <option value="">Select ledger</option>
                      {ledgersByGroup.map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </optgroup>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Amount">
                    <TextInput type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                  </Field>
                  {type === 'PAYMENT' && (
                    <>
                      <Field label="Cheque / reference no.">
                        <TextInput value={form.cheque_no} onChange={e => setForm({ ...form, cheque_no: e.target.value })} />
                      </Field>
                      <Field label="Cheque date">
                        <TextInput type="date" value={form.cheque_date} onChange={e => setForm({ ...form, cheque_date: e.target.value })} />
                      </Field>
                    </>
                  )}
                </>
              )}
            </div>

            <Field label="Narration">
              <TextArea value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Kya transaction hai? (optional)" maxLength={1000} />
            </Field>

            {isItem && (
              <>
                <div className="form-grid-3">
                  <Field label="E-Way bill no.">
                    <TextInput value={form.eway_bill_no} onChange={e => setForm({ ...form, eway_bill_no: e.target.value })} placeholder="Optional" maxLength={20} />
                  </Field>
                  <Field label="Transport name">
                    <TextInput value={form.transport_name} onChange={e => setForm({ ...form, transport_name: e.target.value })} placeholder="Transport / courier" maxLength={120} />
                  </Field>
                  <Field label="Vehicle no.">
                    <TextInput value={form.vehicle_no} onChange={e => setForm({ ...form, vehicle_no: e.target.value.toUpperCase() })} placeholder="GJ01AB1234" maxLength={20} />
                  </Field>
                </div>
                <Field label="Ship to (delivery address)">
                  <TextInput value={form.ship_to} onChange={e => setForm({ ...form, ship_to: e.target.value })} placeholder="Delivery address (optional)" maxLength={300} />
                </Field>
              </>
            )}

            {creditCheck && creditCheck.over && (
              <div className="info-panel warn">
                <Icon name="alert" />
                <div>
                  <p><strong>Credit limit cross ho raha hai.</strong> {creditCheck.name} ka limit {money(creditCheck.limit)} hai, invoice {money(creditCheck.total)}{creditCheck.days ? ` · ${creditCheck.days} din ka credit` : ''}. Save karte waqt server rok sakta hai — Owner/Manager hi override kar sakta hai.</p>
                  <Toggle checked={form.override_credit_limit} onChange={v => setForm({ ...form, override_credit_limit: v })} label="Credit limit override kar do (Owner/Manager only)" />
                </div>
              </div>
            )}

            {!isItem && <div className="accounting-hint">
              <Icon name="shield" size={16} />
              <span>
                {type === 'PAYMENT' && 'Payment: To ledger Dr hoga, From ledger Cr. Cash/Bank dena ho to From me rakho.'}
                {type === 'RECEIPT' && 'Receipt: To ledger (cash/bank) Dr hoga, From ledger (party) Cr.'}
                {type === 'CONTRA' && 'Contra: To ledger Dr, From ledger Cr — dono cash/bank hone chahiye.'}
                {type === 'JOURNAL' && 'Journal: neeche rows me Dr aur Cr manually do. Server balance check karega.'}
              </span>
            </div>}
          </Card>

          {isItem ? (
            <Card
              title="Item details"
              subtitle={`${interState ? 'Inter-state → IGST' : 'Intra-state → CGST + SGST'}`}
              flush
              actions={<Button variant="ghost" type="button" icon="plus" onClick={addRow}>Add row</Button>}
            >
              <div className="table-wrapper">
                <table className="table items-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ minWidth: 190 }}>Item</th>
                      <th style={{ width: 90 }}>Qty</th>
                      <th style={{ width: 110 }}>Rate</th>
                      <th style={{ width: 80 }}>Disc %</th>
                      <th style={{ width: 90 }}>GST %</th>
                      <th style={{ minWidth: 130 }}>Godown</th>
                      <th className="text-right" style={{ width: 130 }}>Amount</th>
                      <th style={{ width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((row, i) => {
                      const stock = items.find(s => Number(s.id) === Number(row.stock_item_id));
                      const gross = (Number(row.qty) || 0) * (Number(row.rate) || 0);
                      const amount = round2(gross - (gross * (Number(row.discount_pct) || 0)) / 100);
                      return (
                        <tr key={i}>
                          <td className="muted">{i + 1}</td>
                          <td>
                            <select value={row.stock_item_id} onChange={e => pickItem(i, e.target.value)} className="inline-select">
                              <option value="">Select item</option>
                              {items.map(it => <option key={it.id} value={it.id}>{it.name} ({it.unit || '—'})</option>)}
                            </select>
                            {stock && <div className="row-hint">HSN {stock.hsn || '—'} · Stock {fmtNumber(stock.opening_qty)} {stock.unit || ''}</div>}
                          </td>
                          <td><input type="number" min="0" step="0.001" value={row.qty} onChange={e => updateRow(i, { qty: e.target.value })} /></td>
                          <td><input type="number" min="0" step="0.01" value={row.rate} onChange={e => updateRow(i, { rate: e.target.value })} /></td>
                          <td><input type="number" min="0" max="100" step="0.01" value={row.discount_pct} onChange={e => updateRow(i, { discount_pct: e.target.value })} /></td>
                          <td>
                            <select value={row.gst_rate} onChange={e => updateRow(i, { gst_rate: e.target.value })} className="inline-select">
                              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </td>
                          <td>
                            <select value={row.godown_id} onChange={e => updateRow(i, { godown_id: e.target.value })} className="inline-select">
                              <option value="">Default</option>
                              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </td>
                          <td className="text-right mono">{plainMoney(amount)}</td>
                          <td>
                            <button type="button" className="icon-btn danger" onClick={() => removeRow(i)} aria-label="Remove row"><Icon name="trash" size={15} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="items-foot">
                <Button variant="ghost" type="button" icon="plus" onClick={addRow}>Add another item</Button>
                <span className="muted small">Discount % item level par lagta hai. GST rate item master se auto aata hai, yahan change kar sakte ho.</span>
              </div>
            </Card>
          ) : type === 'JOURNAL' ? (
            <Card
              title="Journal entries"
              subtitle="Dr = Cr server par validate hoga"
              flush
              actions={<Button variant="ghost" type="button" icon="plus" onClick={() => setForm(f => ({ ...f, entries: [...f.entries, newJournalRow('Dr')] }))}>Add row</Button>}
            >
              <div className="table-wrapper">
                <table className="table items-table">
                  <thead>
                    <tr><th style={{ minWidth: 260 }}>Ledger</th><th style={{ width: 120 }}>Type</th><th style={{ width: 150 }}>Amount</th><th>Narration</th><th style={{ width: 44 }} /></tr>
                  </thead>
                  <tbody>
                    {form.entries.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <select value={row.ledger_id} onChange={e => updateEntry(i, { ledger_id: e.target.value })} className="inline-select">
                            <option value="">Select ledger</option>
                            {ledgersByGroup.map(([group, list]) => (
                              <optgroup key={group} label={group}>
                                {list.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select value={row.entry_type} onChange={e => updateEntry(i, { entry_type: e.target.value })} className="inline-select">
                            <option value="Dr">Dr (Debit)</option>
                            <option value="Cr">Cr (Credit)</option>
                          </select>
                        </td>
                        <td><input type="number" min="0" step="0.01" value={row.amount} onChange={e => updateEntry(i, { amount: e.target.value })} /></td>
                        <td><input value={row.narration} onChange={e => updateEntry(i, { narration: e.target.value })} placeholder="Optional" /></td>
                        <td>
                          <button type="button" className="icon-btn danger" onClick={() => setForm(f => ({ ...f, entries: f.entries.length > 2 ? f.entries.filter((_, idx) => idx !== i) : f.entries }))} aria-label="Remove"><Icon name="trash" size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="journal-foot">
                <span>Total Dr <strong className="mono">{money(journalTotals.dr)}</strong></span>
                <span>Total Cr <strong className="mono">{money(journalTotals.cr)}</strong></span>
                <span className={journalTotals.balanced ? 'tag tag-good' : 'tag tag-bad'}>
                  {journalTotals.balanced ? 'Balanced ✓' : `Difference ${money(Math.abs(journalTotals.diff))}`}
                </span>
              </div>
            </Card>
          ) : (
            <Card title="Accounting preview" subtitle="Server isi logic se posting karega">
              <div className="ledger-preview">
                <div className="preview-row">
                  <span className="tag tag-good">Dr</span>
                  <strong>{ledgers.find(l => Number(l.id) === Number(form.to_ledger_id))?.name || 'To ledger'}</strong>
                  <span className="mono">{money(form.amount || 0)}</span>
                </div>
                <div className="preview-row">
                  <span className="tag tag-bad">Cr</span>
                  <strong>{ledgers.find(l => Number(l.id) === Number(form.from_ledger_id))?.name || 'From ledger'}</strong>
                  <span className="mono">{money(form.amount || 0)}</span>
                </div>
              </div>
            </Card>
          )}
        </div>

        <aside className="stack">
          <Card title="Summary" className="summary-card">
            {isItem ? (
              <>
                <div className="summary-line"><span>Gross</span><span className="mono">{money(totals.gross)}</span></div>
                <div className="summary-line"><span>Discount</span><span className="mono">− {money(totals.discount)}</span></div>
                <div className="summary-line"><span>Taxable value</span><span className="mono">{money(totals.taxable)}</span></div>
                <div className="summary-sep" />
                {interState ? (
                  <div className="summary-line"><span>IGST</span><span className="mono">{money(totals.igst)}</span></div>
                ) : (
                  <>
                    <div className="summary-line"><span>CGST</span><span className="mono">{money(totals.cgst)}</span></div>
                    <div className="summary-line"><span>SGST</span><span className="mono">{money(totals.sgst)}</span></div>
                  </>
                )}
                <div className="summary-line"><span>Round off</span><span className="mono">{money(totals.roundoff)}</span></div>
                <div className="summary-total"><span>Grand total</span><span className="mono">{money(totals.total)}</span></div>
                <div className="summary-meta">
                  <div><small>Items</small><strong>{form.items.filter(r => r.stock_item_id).length}</strong></div>
                  <div><small>Quantity</small><strong>{fmtNumber(totals.qty)}</strong></div>
                  <div><small>GST mode</small><strong>{interState ? 'IGST' : 'CGST+SGST'}</strong></div>
                </div>
              </>
            ) : type === 'JOURNAL' ? (
              <>
                <div className="summary-line"><span>Total debit</span><span className="mono">{money(journalTotals.dr)}</span></div>
                <div className="summary-line"><span>Total credit</span><span className="mono">{money(journalTotals.cr)}</span></div>
                <div className="summary-total"><span>Difference</span><span className="mono">{money(Math.abs(journalTotals.diff))}</span></div>
                <div className={`balance-pill ${journalTotals.balanced ? 'good' : 'bad'}`}>
                  <Icon name={journalTotals.balanced ? 'check' : 'alert'} size={15} />
                  {journalTotals.balanced ? 'Dr = Cr, save ke liye ready' : 'Dr aur Cr barabar karo'}
                </div>
              </>
            ) : (
              <>
                <div className="summary-line"><span>Amount</span><span className="mono">{money(form.amount || 0)}</span></div>
                <div className="summary-total"><span>Total</span><span className="mono">{money(form.amount || 0)}</span></div>
              </>
            )}
            <Button variant="primary" type="submit" icon="save" disabled={saving || !canSave} className="btn-block">
              {saving ? 'Saving...' : isEdit ? 'Update voucher' : 'Save voucher'}
            </Button>
            <p className="muted small" style={{ margin: 0 }}>
              Ctrl + Enter se bhi save kar sakte ho. Server par Dr = Cr dobara verify hota hai.
            </p>
          </Card>

          {savedVoucher && (
            <Card title="Last saved" className="last-saved">
              <div className="saved-number mono">{savedVoucher.number}</div>
              <div className="summary-line"><span>Amount</span><span className="mono">{money(savedVoucher.total)}</span></div>
              <div className="modal-inline-actions">
                {(type === 'SALES' || type === 'DEBIT_NOTE') && (
                  <Button icon="print" onClick={() => window.open(`/print/voucher/${savedVoucher.id}`, '_blank')}>Print</Button>
                )}
                <Button variant="ghost" icon="book" onClick={() => navigate('/daybook')}>Daybook</Button>
              </div>
            </Card>
          )}

          <Card title="GST rule" subtitle="Auto-applied">
            <div className="info-stack">
              <div><Icon name="check" size={15} /><span>Place of supply aur company state same → CGST + SGST</span></div>
              <div><Icon name="check" size={15} /><span>Alag state → IGST full</span></div>
              <div><Icon name="check" size={15} /><span>Taxable value par discount ke baad GST lagta hai</span></div>
              <div><Icon name="check" size={15} /><span>Total nearest rupee me round, difference Round Off ledger me</span></div>
            </div>
          </Card>
        </aside>
      </form>
    </div>
  );
}
