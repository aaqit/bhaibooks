import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, Modal, PageHeader, SearchInput, SelectInput, TextInput, Toggle,
} from '../components/ui.jsx';
import { GST_RATES, STATES, fmtNumber, money, plainMoney } from '../utils.js';

const TABS = [
  { key: 'ledgers', label: 'Ledgers', icon: 'company' },
  { key: 'stock', label: 'Stock Items', icon: 'box' },
  { key: 'groups', label: 'Groups', icon: 'book' },
  { key: 'godowns', label: 'Godowns', icon: 'truck' },
  { key: 'units', label: 'Units', icon: 'chart' },
];

function flattenGroups(nodes, depth = 0, out = []) {
  for (const g of nodes || []) {
    out.push({ ...g, depth });
    flattenGroups(g.children, depth + 1, out);
  }
  return out;
}

const EMPTY_LEDGER = {
  name: '', group_id: '', opening_balance: 0, opening_type: 'Dr', gstin: '', gst_type: 'Unregistered',
  state: '', phone: '', email: '', address: '', credit_limit: 0, credit_days: 0,
  bank_name: '', account_no: '', ifsc: '', upi: '', is_active: true,
};

const EMPTY_ITEM = {
  name: '', stock_group_id: '', unit_id: '', hsn: '', gst_rate: 5, sale_price: 0, purchase_price: 0,
  opening_qty: 0, opening_rate: 0, reorder_level: 0, batch_enabled: false, is_active: true,
};

export default function Masters() {
  const { tab: routeTab } = useParams();
  const tab = TABS.some(t => t.key === routeTab) ? routeTab : 'ledgers';
  const { companyId, hasCap } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canEdit = hasCap('masters');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setBoot(await api('/masters/bootstrap'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Masters · BahiBooks';
    load();
    setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, tab]);

  const flatGroups = useMemo(() => flattenGroups(boot?.groups || []), [boot]);

  const filteredLedgers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (boot?.ledgers || []).filter(l => !q
      || l.name.toLowerCase().includes(q)
      || (l.group_name || '').toLowerCase().includes(q)
      || (l.gstin || '').toLowerCase().includes(q));
  }, [boot, search]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (boot?.stockItems || []).filter(i => !q
      || i.name.toLowerCase().includes(q)
      || (i.group_name || '').toLowerCase().includes(q)
      || (i.hsn || '').toLowerCase().includes(q));
  }, [boot, search]);

  const openLedger = (ledger = null) => {
    setForm(ledger ? {
      ...EMPTY_LEDGER, ...ledger, is_active: !!ledger.is_active,
    } : { ...EMPTY_LEDGER, group_id: flatGroups.find(g => /Sundry Debtors/i.test(g.name))?.id || flatGroups[0]?.id || '' });
    setModal({ kind: 'ledger', editing: ledger });
  };

  const openItem = (item = null) => {
    setForm(item ? { ...EMPTY_ITEM, ...item, is_active: !!item.is_active, batch_enabled: !!item.batch_enabled } : {
      ...EMPTY_ITEM,
      stock_group_id: boot?.stockGroups?.[0]?.id || '',
      unit_id: boot?.units?.[0]?.id || '',
    });
    setModal({ kind: 'item', editing: item });
  };

  const openGroup = () => {
    setForm({ name: '', parent_id: '', nature: 'ASSET', category: 'ASSET' });
    setModal({ kind: 'group' });
  };

  const openGodown = (g = null) => {
    setForm(g ? { ...g } : { name: '', address: '', is_default: false });
    setModal({ kind: 'godown', editing: g });
  };

  const openUnit = () => {
    setForm({ name: '', symbol: '' });
    setModal({ kind: 'unit' });
  };

  const openStockGroup = () => {
    setForm({ name: '', parent_id: '' });
    setModal({ kind: 'stock-group' });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.kind === 'ledger') {
        const body = { ...form, group_id: Number(form.group_id), opening_balance: Number(form.opening_balance) || 0 };
        if (modal.editing) await api(`/masters/ledgers/${modal.editing.id}`, { method: 'PUT', body });
        else await api('/masters/ledgers', { method: 'POST', body });
        toast.success(modal.editing ? 'Ledger update ho gaya' : 'Ledger create ho gaya');
      } else if (modal.kind === 'item') {
        const body = {
          ...form,
          stock_group_id: form.stock_group_id ? Number(form.stock_group_id) : null,
          unit_id: Number(form.unit_id),
          gst_rate: Number(form.gst_rate),
          sale_price: Number(form.sale_price) || 0,
          purchase_price: Number(form.purchase_price) || 0,
          opening_qty: Number(form.opening_qty) || 0,
          opening_rate: Number(form.opening_rate) || 0,
          reorder_level: Number(form.reorder_level) || 0,
        };
        if (modal.editing) await api(`/masters/stock-items/${modal.editing.id}`, { method: 'PUT', body });
        else await api('/masters/stock-items', { method: 'POST', body });
        toast.success(modal.editing ? 'Item update ho gaya' : 'Stock item create ho gaya');
      } else if (modal.kind === 'group') {
        await api('/masters/groups', { method: 'POST', body: { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null } });
        toast.success('Group create ho gaya');
      } else if (modal.kind === 'godown') {
        if (modal.editing) await api(`/masters/godowns/${modal.editing.id}`, { method: 'PUT', body: form });
        else await api('/masters/godowns', { method: 'POST', body: form });
        toast.success(modal.editing ? 'Godown update ho gaya' : 'Godown create ho gaya');
      } else if (modal.kind === 'unit') {
        await api('/masters/units', { method: 'POST', body: form });
        toast.success('Unit create ho gaya');
      } else if (modal.kind === 'stock-group') {
        await api('/masters/stock-groups', { method: 'POST', body: { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null } });
        toast.success('Stock group create ho gaya');
      }
      setModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { kind, row } = deleteTarget;
      if (kind === 'ledger') await api(`/masters/ledgers/${row.id}`, { method: 'DELETE' });
      if (kind === 'item') await api(`/masters/stock-items/${row.id}`, { method: 'DELETE' });
      if (kind === 'group') await api(`/masters/groups/${row.id}`, { method: 'DELETE' });
      if (kind === 'godown') await api(`/masters/godowns/${row.id}`, { method: 'DELETE' });
      toast.success('Delete ho gaya');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label="Masters load ho rahe hain..." />;
  if (error) return <ErrorBox error={error} onRetry={load} />;

  const ledgerPreview = form.group_id
    ? flatGroups.find(g => Number(g.id) === Number(form.group_id))
    : null;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Masters"
        title="Company masters"
        subtitle="Ledgers, stock items, groups, godowns aur units — sab ek jagah."
        actions={<Button icon="refresh" onClick={load}>Refresh</Button>}
      />

      <div className="master-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" className={`master-tab ${tab === t.key ? 'active' : ''}`} onClick={() => navigate(`/masters/${t.key}`)}>
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="filter-bar">
          <Field label="Search" className="grow">
            <SearchInput value={search} onChange={setSearch} placeholder={`Search ${tab}...`} />
          </Field>
          <div className="filter-actions">
            {tab === 'ledgers' && canEdit && <Button variant="primary" icon="plus" onClick={() => openLedger()}>New ledger</Button>}
            {tab === 'stock' && canEdit && <Button variant="primary" icon="plus" onClick={() => openItem()}>New stock item</Button>}
            {tab === 'groups' && canEdit && (
              <>
                <Button icon="plus" onClick={openStockGroup}>Stock group</Button>
                <Button variant="primary" icon="plus" onClick={openGroup}>Account group</Button>
              </>
            )}
            {tab === 'godowns' && canEdit && <Button variant="primary" icon="plus" onClick={() => openGodown()}>New godown</Button>}
            {tab === 'units' && canEdit && <Button variant="primary" icon="plus" onClick={openUnit}>New unit</Button>}
          </div>
        </div>
      </Card>

      {tab === 'ledgers' && (
        <Card title={`Ledgers · ${filteredLedgers.length}`} flush>
          {filteredLedgers.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Group</th><th>Opening</th><th>GSTIN</th><th>State</th><th className="text-right">Credit limit</th><th /></tr>
                </thead>
                <tbody>
                  {filteredLedgers.map(l => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-strong">{l.name} {l.system_key && <span className="tag">system</span>}</div>
                        {l.phone && <div className="row-hint">{l.phone}</div>}
                      </td>
                      <td>{l.group_name}</td>
                      <td className="mono">{money(l.opening_balance)} <span className="muted">{l.opening_type}</span></td>
                      <td className="mono">{l.gstin || '—'}</td>
                      <td>{l.state || '—'}</td>
                      <td className="text-right mono">{l.credit_limit ? money(l.credit_limit) : '—'}</td>
                      <td>
                        <div className="row-actions">
                          {canEdit && <button type="button" className="icon-btn" onClick={() => openLedger(l)} title="Edit"><Icon name="edit" size={15} /></button>}
                          {canEdit && !l.system_key && <button type="button" className="icon-btn danger" onClick={() => setDeleteTarget({ kind: 'ledger', row: l })} title="Delete"><Icon name="trash" size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Koi ledger nahi mila" icon="company" />}
        </Card>
      )}

      {tab === 'stock' && (
        <Card title={`Stock items · ${filteredItems.length}`} flush>
          {filteredItems.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Item</th><th>Group</th><th>HSN</th><th className="text-right">GST</th><th className="text-right">Sale</th><th className="text-right">Purchase</th><th className="text-right">Opening qty</th><th className="text-right">Reorder</th><th /></tr>
                </thead>
                <tbody>
                  {filteredItems.map(it => (
                    <tr key={it.id}>
                      <td><div className="cell-strong">{it.name}</div><div className="row-hint">Unit: {it.unit || '—'}</div></td>
                      <td>{it.group_name || '—'}</td>
                      <td className="mono">{it.hsn || '—'}</td>
                      <td className="text-right">{it.gst_rate}%</td>
                      <td className="text-right mono">{money(it.sale_price)}</td>
                      <td className="text-right mono">{money(it.purchase_price)}</td>
                      <td className="text-right mono">{fmtNumber(it.opening_qty)}</td>
                      <td className="text-right mono">{fmtNumber(it.reorder_level)}</td>
                      <td>
                        <div className="row-actions">
                          {canEdit && <button type="button" className="icon-btn" onClick={() => openItem(it)} title="Edit"><Icon name="edit" size={15} /></button>}
                          {canEdit && <button type="button" className="icon-btn danger" onClick={() => setDeleteTarget({ kind: 'item', row: it })} title="Delete"><Icon name="trash" size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Koi stock item nahi mila" icon="box" />}
        </Card>
      )}

      {tab === 'groups' && (
        <div className="grid grid-2">
          <Card title="Account groups" subtitle="Tally hierarchy — nature aur category reports decide karti hai" flush>
            <div className="table-wrapper">
              <table className="table table-compact">
                <thead><tr><th>Group</th><th>Nature</th><th>Category</th><th /></tr></thead>
                <tbody>
                  {flatGroups.filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).map(g => (
                    <tr key={g.id}>
                      <td><span style={{ paddingLeft: g.depth * 16 }}>{g.depth ? '└ ' : ''}{g.name}</span></td>
                      <td className="muted">{g.nature}</td>
                      <td className="muted">{g.category}</td>
                      <td>
                        {canEdit && !g.is_system && (
                          <button type="button" className="icon-btn danger" onClick={() => setDeleteTarget({ kind: 'group', row: g })} title="Delete"><Icon name="trash" size={15} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Stock groups" subtitle="Item classification" flush>
            <div className="table-wrapper">
              <table className="table table-compact">
                <thead><tr><th>Name</th></tr></thead>
                <tbody>
                  {(boot?.stockGroups || []).map(g => <tr key={g.id}><td>{g.name}</td></tr>)}
                  {!(boot?.stockGroups || []).length && <tr><td className="muted">Koi stock group nahi</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'godowns' && (
        <Card title="Godowns / warehouses" flush>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Name</th><th>Address</th><th>Default</th><th /></tr></thead>
              <tbody>
                {(boot?.godowns || []).filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase())).map(g => (
                  <tr key={g.id}>
                    <td className="cell-strong">{g.name}</td>
                    <td>{g.address || '—'}</td>
                    <td>{g.is_default ? <span className="tag tag-good">Default</span> : '—'}</td>
                    <td>
                      <div className="row-actions">
                        {canEdit && <button type="button" className="icon-btn" onClick={() => openGodown(g)} title="Edit"><Icon name="edit" size={15} /></button>}
                        {canEdit && !g.is_default && <button type="button" className="icon-btn danger" onClick={() => setDeleteTarget({ kind: 'godown', row: g })} title="Delete"><Icon name="trash" size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'units' && (
        <Card title="Units" flush>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Name</th><th>Symbol</th></tr></thead>
              <tbody>
                {(boot?.units || []).filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase())).map(u => (
                  <tr key={u.id}><td>{u.name}</td><td className="mono">{u.symbol}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        width={modal?.kind === 'ledger' ? 760 : 600}
        title={{
          ledger: modal?.editing ? 'Edit ledger' : 'New ledger',
          item: modal?.editing ? 'Edit stock item' : 'New stock item',
          group: 'New account group',
          godown: modal?.editing ? 'Edit godown' : 'New godown',
          unit: 'New unit',
          'stock-group': 'New stock group',
        }[modal?.kind] || ''}
        subtitle={modal?.kind === 'ledger' ? 'Opening balance Dr/Cr ke saath' : undefined}
        footer={(
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="master-form" icon="save" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        )}
      >
        <form id="master-form" onSubmit={save} className="stack">
          {modal?.kind === 'ledger' && (
            <>
              <div className="form-grid">
                <Field label="Ledger name" className="span-2">
                  <TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Rajesh Textiles" />
                </Field>
                <Field label="Under group">
                  <SelectInput value={form.group_id || ''} onChange={e => setForm({ ...form, group_id: e.target.value })} required>
                    <option value="">Select group</option>
                    {flatGroups.map(g => <option key={g.id} value={g.id}>{'\u00A0'.repeat(g.depth * 3)}{g.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Nature">
                  <TextInput readOnly className="readonly" value={ledgerPreview ? `${ledgerPreview.nature} · ${ledgerPreview.category}` : ''} />
                </Field>
                <Field label="Opening balance">
                  <TextInput type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} />
                </Field>
                <Field label="Opening type">
                  <SelectInput value={form.opening_type} onChange={e => setForm({ ...form, opening_type: e.target.value })}>
                    <option value="Dr">Dr (Debit)</option>
                    <option value="Cr">Cr (Credit)</option>
                  </SelectInput>
                </Field>
                <Field label="GSTIN">
                  <TextInput value={form.gstin || ''} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} maxLength={15} />
                </Field>
                <Field label="GST registration">
                  <SelectInput value={form.gst_type} onChange={e => setForm({ ...form, gst_type: e.target.value })}>
                    {['Unregistered', 'Regular', 'Composition', 'Consumer', 'Overseas'].map(t => <option key={t} value={t}>{t}</option>)}
                  </SelectInput>
                </Field>
                <Field label="State">
                  <SelectInput value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })}>
                    <option value="">—</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Phone">
                  <TextInput value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <TextInput value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Credit limit">
                  <TextInput type="number" min="0" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
                </Field>
                <Field label="Credit days">
                  <TextInput type="number" min="0" value={form.credit_days} onChange={e => setForm({ ...form, credit_days: e.target.value })} />
                </Field>
                <Field label="Address" className="span-2">
                  <TextInput value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} />
                </Field>
                <Field label="Bank name">
                  <TextInput value={form.bank_name || ''} onChange={e => setForm({ ...form, bank_name: e.target.value })} />
                </Field>
                <Field label="Account no.">
                  <TextInput value={form.account_no || ''} onChange={e => setForm({ ...form, account_no: e.target.value })} />
                </Field>
                <Field label="IFSC">
                  <TextInput value={form.ifsc || ''} onChange={e => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="UPI ID">
                  <TextInput value={form.upi || ''} onChange={e => setForm({ ...form, upi: e.target.value })} />
                </Field>
              </div>
              <div className="info-panel"><Toggle checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} label="Ledger active hai (voucher me dikhega)" /></div>
            </>
          )}

          {modal?.kind === 'item' && (
            <>
              <div className="form-grid">
                <Field label="Item name" className="span-2">
                  <TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Cotton Saree" />
                </Field>
                <Field label="Stock group">
                  <SelectInput value={form.stock_group_id || ''} onChange={e => setForm({ ...form, stock_group_id: e.target.value })}>
                    <option value="">—</option>
                    {(boot?.stockGroups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Unit">
                  <SelectInput value={form.unit_id || ''} onChange={e => setForm({ ...form, unit_id: e.target.value })} required>
                    <option value="">Select unit</option>
                    {(boot?.units || []).map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                  </SelectInput>
                </Field>
                <Field label="HSN / SAC">
                  <TextInput value={form.hsn || ''} onChange={e => setForm({ ...form, hsn: e.target.value })} maxLength={12} />
                </Field>
                <Field label="GST rate">
                  <SelectInput value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: e.target.value })}>
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </SelectInput>
                </Field>
                <Field label="Sale price">
                  <TextInput type="number" min="0" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} />
                </Field>
                <Field label="Purchase price">
                  <TextInput type="number" min="0" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} />
                </Field>
                <Field label="Opening quantity">
                  <TextInput type="number" step="0.001" value={form.opening_qty} onChange={e => setForm({ ...form, opening_qty: e.target.value })} />
                </Field>
                <Field label="Opening rate">
                  <TextInput type="number" step="0.01" value={form.opening_rate} onChange={e => setForm({ ...form, opening_rate: e.target.value })} />
                </Field>
                <Field label="Reorder level">
                  <TextInput type="number" step="0.001" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} />
                </Field>
                <Field label="Opening value">
                  <TextInput readOnly className="readonly" value={plainMoney((Number(form.opening_qty) || 0) * (Number(form.opening_rate) || 0))} />
                </Field>
              </div>
              <div className="info-panel"><Toggle checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} label="Item active hai" /></div>
            </>
          )}

          {modal?.kind === 'group' && (
            <div className="form-grid">
              <Field label="Group name" className="span-2">
                <TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Transport Expenses" />
              </Field>
              <Field label="Parent group" className="span-2">
                <SelectInput value={form.parent_id || ''} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                  <option value="">Top level group</option>
                  {flatGroups.map(g => <option key={g.id} value={g.id}>{'\u00A0'.repeat(g.depth * 3)}{g.name}</option>)}
                </SelectInput>
              </Field>
              {!form.parent_id && (
                <>
                  <Field label="Nature">
                    <SelectInput value={form.nature} onChange={e => setForm({ ...form, nature: e.target.value })}>
                      {['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map(n => <option key={n} value={n}>{n}</option>)}
                    </SelectInput>
                  </Field>
                  <Field label="Report category">
                    <SelectInput value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      {['ASSET', 'LIABILITY', 'EQUITY', 'DIRECT_INCOME', 'DIRECT_EXPENSE', 'INDIRECT_INCOME', 'INDIRECT_EXPENSE'].map(c => <option key={c} value={c}>{c}</option>)}
                    </SelectInput>
                  </Field>
                </>
              )}
              <p className="muted small span-2" style={{ margin: 0 }}>Sub-group parent ki nature aur category inherit karta hai. System groups delete nahi ho sakte.</p>
            </div>
          )}

          {modal?.kind === 'godown' && (
            <div className="stack">
              <Field label="Godown name"><TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Address"><TextInput value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
              <div className="info-panel"><Toggle checked={!!form.is_default} onChange={v => setForm({ ...form, is_default: v })} label="Default godown banao" /></div>
            </div>
          )}

          {modal?.kind === 'unit' && (
            <div className="form-grid">
              <Field label="Unit name"><TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Pieces" /></Field>
              <Field label="Symbol"><TextInput value={form.symbol || ''} onChange={e => setForm({ ...form, symbol: e.target.value })} placeholder="Pcs" /></Field>
            </div>
          )}

          {modal?.kind === 'stock-group' && (
            <div className="form-grid">
              <Field label="Stock group name" className="span-2"><TextInput value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Fabrics" /></Field>
              <Field label="Parent stock group" className="span-2">
                <SelectInput value={form.parent_id || ''} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                  <option value="">Top level</option>
                  {(boot?.stockGroups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </SelectInput>
              </Field>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete karna hai?"
        width={430}
        footer={(
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon="trash" onClick={confirmDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</Button>
          </div>
        )}
      >
        <p className="muted" style={{ margin: 0 }}>
          <strong>{deleteTarget?.row?.name}</strong> delete ho jayega. Agar ye kisi voucher me use hua hai to server delete block kar dega — us case me inactive kar do.
        </p>
      </Modal>
    </div>
  );
}
