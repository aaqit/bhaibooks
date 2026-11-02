import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Button, Card, Field, Icon, Modal, PageHeader, SelectInput, TextInput, Toggle } from '../components/ui.jsx';
import { STATES, fmtDate } from '../utils.js';

const EMPTY = {
  name: '', financial_year: '2026-2027', books_from: '2026-04-01', currency: 'INR',
  gstin: '', pan: '', address: '', city: '', state: 'Gujarat', pincode: '', phone: '', email: '',
};

export default function CompanySelect() {
  const { companies, companyId, setCompanyId, hasCap, refresh, isWeb, mode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [seedDemo, setSeedDemo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Companies · BahiBooks'; }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setSeedDemo(false);
    setError('');
    setOpen(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ ...EMPTY, ...c });
    setSeedDemo(false);
    setError('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api(`/companies/${editing.id}`, { method: 'PATCH', body: form });
        toast.success('Company profile update ho gayi');
        await refresh();
      } else {
        const res = await api('/companies', { method: 'POST', body: { ...form, seed_demo: seedDemo } });
        toast.success(`${res.company.name} create ho gayi`);
        await refresh();
        setCompanyId(res.company.id);
        setOpen(false);
        navigate('/');
        return;
      }
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const choose = (c) => {
    setCompanyId(c.id);
    toast.success(`${c.name} select ho gayi`);
    navigate('/');
  };

  const canManage = hasCap('settings') && !isWeb;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Multi-company"
        title="Companies"
        subtitle="Har company ka data alag folder me rehta hai. Ek dukan ka data dusri dukan ko kabhi nahi dikhega."
        actions={canManage ? <Button variant="primary" icon="plus" onClick={openCreate}>New company</Button> : null}
      />

      {isWeb && (
        <div className="info-panel warn">
          <Icon name="lock" />
          <p>Web mode me aap sirf apni assigned company use kar sakte ho. Nayi company create ya edit karne ke liye PC app kholo.</p>
        </div>
      )}

      <div className="grid grid-2">
        {companies.map(c => (
          <section key={c.id} className={`card company-tile ${c.id === companyId ? 'active' : ''}`}>
            <div className="company-tile-top">
              <div className="company-avatar large"><Icon name="company" size={22} /></div>
              <div className="company-tile-main">
                <h3>{c.name}</h3>
                <div className="muted small">FY {c.financial_year} · Books from {fmtDate(c.books_from)}</div>
              </div>
              {c.id === companyId && <span className="tag tag-good">Active</span>}
              {c.locked && <span className="tag tag-warn"><Icon name="lock" size={12} /> Vault</span>}
            </div>
            <div className="company-tile-grid">
              <div><small>GSTIN</small><span className="mono">{c.gstin || '—'}</span></div>
              <div><small>PAN</small><span className="mono">{c.pan || '—'}</span></div>
              <div><small>State</small><span>{c.state || '—'}</span></div>
              <div><small>City</small><span>{c.city || '—'}</span></div>
            </div>
            <div className="company-tile-foot">
              <Button variant={c.id === companyId ? 'primary' : ''} icon="check" onClick={() => choose(c)}>
                {c.id === companyId ? 'Open dashboard' : 'Select & open'}
              </Button>
              {canManage && <Button variant="ghost" icon="edit" onClick={() => openEdit(c)}>Edit</Button>}
            </div>
          </section>
        ))}
        {!companies.length && (
          <Card>
            <div className="empty">
              <div className="empty-icon"><Icon name="company" size={30} /></div>
              <h4>Koi company nahi hai</h4>
              <p>Super Admin ya Shop Owner se nayi company create karwao.</p>
              {canManage && <Button variant="primary" icon="plus" onClick={openCreate}>Create first company</Button>}
            </div>
          </Card>
        )}
      </div>

      <Card title="Company-wise access" subtitle={`Aapka access mode: ${mode === 'web' ? 'Web (limited)' : 'PC Desktop (full)'}`}>
        <p className="muted" style={{ margin: 0 }}>
          Super Admin sab companies dekh sakta hai. Owner apni companies, Manager aur Operator apni assigned company.
          Web par login karne par sirf Dashboard + Voucher Entry milta hai — backend bhi wahi allow karta hai.
        </p>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit company' : 'New company'}
        subtitle={editing ? editing.id : 'Nayi company ka alag data folder banega'}
        width={720}
        footer={(
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="company-form" icon="save" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update company' : 'Create company'}
            </Button>
          </div>
        )}
      >
        <form id="company-form" onSubmit={submit} className="stack">
          {error && <div className="form-error"><Icon name="alert" size={16} /> {error}</div>}
          <div className="form-grid">
            <Field label="Company name" className="span-2">
              <TextInput value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Shree Ganesh Traders" />
            </Field>
            <Field label="Financial year">
              <TextInput value={form.financial_year} onChange={e => setForm({ ...form, financial_year: e.target.value })} placeholder="2026-2027" required />
            </Field>
            <Field label="Books beginning">
              <TextInput type="date" value={form.books_from} onChange={e => setForm({ ...form, books_from: e.target.value })} required />
            </Field>
            <Field label="GSTIN">
              <TextInput value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="24AABCS1429B1Z1" maxLength={15} />
            </Field>
            <Field label="PAN">
              <TextInput value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="AABCS1429B" maxLength={10} />
            </Field>
            <Field label="Address" className="span-2">
              <TextInput value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Shop / building / market" />
            </Field>
            <Field label="City">
              <TextInput value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="State">
              <SelectInput value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            </Field>
            <Field label="Pincode">
              <TextInput value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} maxLength={6} />
            </Field>
            <Field label="Phone">
              <TextInput value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email" className="span-2">
              <TextInput type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          {!editing && (
            <div className="info-panel">
              <Toggle checked={seedDemo} onChange={setSeedDemo} label="Demo masters + sample vouchers ke saath start karo" />
            </div>
          )}
          <p className="muted small" style={{ margin: 0 }}>
            Company banne par Tally ke default groups, GST ledgers, Cash/Bank aur demo parties automatically ready ho jayenge.
            {editing ? ' Books beginning change karne par purane vouchers par asar pad sakta hai — savdhaani se.' : ''}
          </p>
        </form>
      </Modal>
    </div>
  );
}
