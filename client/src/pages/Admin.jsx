import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, Modal, PageHeader, SelectInput, TextInput, Toggle,
} from '../components/ui.jsx';
import { fmtDateTime } from '../utils.js';

const ROLE_NOTES = {
  super_admin: 'Sab companies, users, settings aur delete rights.',
  owner: 'Apni companies ka full access, users manage nahi.',
  manager: 'Masters, vouchers, reports, GST — audit tak.',
  operator: 'Sirf entry aur daybook. Delete nahi.',
  auditor: 'Read-only: reports, GST, audit. Entry nahi.',
};

export default function Admin({ mode = 'users' }) {
  useEffect(() => { document.title = `${mode === 'users' ? 'Users & Roles' : 'Audit Log'} · BahiBooks`; }, [mode]);

  return mode === 'audit' ? <AuditLog /> : <Users />;
}

function Users() {
  const { companyId, user: me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api('/admin/users')); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const open = (u = null) => {
    setForm(u ? {
      username: u.username, full_name: u.full_name, role: u.role, active: !!u.active,
      company_scope: u.scope === 'ALL' ? 'ALL' : (u.scope || []),
      password: '',
    } : {
      username: '', full_name: '', password: '', role: 'operator', active: true, company_scope: 'ALL',
    });
    setModal(u ? { editing: u } : { editing: null });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        full_name: form.full_name,
        role: form.role,
        active: form.active,
        company_scope: form.company_scope,
      };
      if (form.password) body.password = form.password;
      if (modal.editing) {
        await api(`/admin/users/${modal.editing.id}`, { method: 'PATCH', body });
        toast.success('User update ho gaya');
      } else {
        await api('/admin/users', { method: 'POST', body: { ...body, username: form.username, password: form.password } });
        toast.success('User create ho gaya');
      }
      setModal(null);
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      toast.success(u.active ? 'User deactivate ho gaya' : 'User activate ho gaya');
      await load();
    } catch (err) { toast.error(err.message); }
  };

  if (loading) return <Loading label="Users load ho rahe hain..." />;
  if (error) return <ErrorBox error={error} onRetry={load} />;

  const users = data?.users || [];
  const companies = data?.companies || [];
  const roles = data?.roles || [];
  const caps = data?.caps || {};

  const scopeLabel = (u) => {
    if (u.scope === 'ALL' || u.role === 'super_admin') return 'All companies';
    const names = (u.scope || []).map(id => companies.find(c => c.id === id)?.name || id);
    return names.join(', ') || '—';
  };

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Administration"
        title="Users & Roles"
        subtitle="Tally jaise roles, company-wise access. Server har request par permission check karta hai."
        actions={<><Button icon="refresh" onClick={load}>Refresh</Button><Button variant="primary" icon="plus" onClick={() => open()}>New user</Button></>}
      />

      <Card title={`Users · ${users.length}`} flush>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th>Company access</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-strong">{u.full_name} {u.id === me?.id && <span className="tag">you</span>}</div>
                    <div className="row-hint mono">@{u.username}</div>
                  </td>
                  <td>
                    <span className="tag">{roles.find(r => r.value === u.role)?.label || u.role}</span>
                  </td>
                  <td className="muted">{scopeLabel(u)}</td>
                  <td>{u.active ? <span className="tag tag-good">Active</span> : <span className="tag tag-bad">Disabled</span>}</td>
                  <td className="muted small">{fmtDateTime(u.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" title="Edit" onClick={() => open(u)}><Icon name="edit" size={15} /></button>
                      {u.id !== me?.id && (
                        <button type="button" className={`icon-btn ${u.active ? 'danger' : ''}`} title={u.active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(u)}>
                          <Icon name={u.active ? 'lock' : 'check'} size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Role capability matrix" subtitle="Kaun kya kar sakta hai — desktop app me">
        <div className="table-wrapper">
          <table className="table table-compact">
            <thead>
              <tr><th>Capability</th>{roles.map(r => <th key={r.value} className="text-center">{r.label}</th>)}</tr>
            </thead>
            <tbody>
              {[...new Set(Object.values(caps).flat())].map(cap => (
                <tr key={cap}>
                  <td className="mono">{cap}</td>
                  {roles.map(r => (
                    <td key={r.value} className="text-center">
                      {(caps[r.value] || []).includes(cap) ? <Icon name="check" size={15} /> : <span className="muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="role-notes">
          {roles.map(r => <div key={r.value}><strong>{r.label}</strong><span>{ROLE_NOTES[r.value]}</span></div>)}
        </div>
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.editing ? `Edit @${modal.editing.username}` : 'New user'}
        width={620}
        footer={(
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="user-form" icon="save" disabled={saving}>{saving ? 'Saving...' : 'Save user'}</Button>
          </div>
        )}
      >
        <form id="user-form" onSubmit={save} className="stack">
          <div className="form-grid">
            {!modal?.editing && (
              <Field label="Username">
                <TextInput value={form.username || ''} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase() })} required placeholder="e.g. rahul" />
              </Field>
            )}
            <Field label="Full name">
              <TextInput value={form.full_name || ''} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
            </Field>
            <Field label="Role">
              <SelectInput value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </SelectInput>
            </Field>
            <Field label={modal?.editing ? 'New password (optional)' : 'Password'}>
              <TextInput type="password" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} required={!modal?.editing} minLength={6} autoComplete="new-password" />
            </Field>
            <Field label="Company access" className="span-2">
              <SelectInput
                value={Array.isArray(form.company_scope) ? 'SELECTED' : (form.company_scope || 'ALL')}
                onChange={e => setForm({ ...form, company_scope: e.target.value === 'ALL' ? 'ALL' : companies.map(c => c.id) })}
                disabled={form.role === 'super_admin'}
              >
                <option value="ALL">All companies</option>
                <option value="SELECTED">Selected companies (all current)</option>
              </SelectInput>
            </Field>
          </div>
          <p className="muted small" style={{ margin: 0 }}>{ROLE_NOTES[form.role] || ''} Super Admin hamesha sab companies dekhta hai.</p>
          <div className="info-panel">
            <Toggle checked={!!form.active} onChange={v => setForm({ ...form, active: v })} label="User active hai (login kar sakta hai)" />
          </div>
          {modal?.editing && <p className="muted small" style={{ margin: 0 }}>Password blank chhodo to purana password hi rahega.</p>}
        </form>
      </Modal>
    </div>
  );
}

function AuditLog() {
  const { companyId } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api('/admin/audit?limit=400');
      setRows(res.audit || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => !q
      || String(r.action).toLowerCase().includes(q)
      || String(r.username).toLowerCase().includes(q)
      || String(r.detail).toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        subtitle="Kaun, kab, kya badla — har important action ka record."
        actions={<><Button icon="refresh" onClick={load}>Refresh</Button><Button icon="print" onClick={() => window.print()}>Print</Button></>}
      />

      <Card>
        <div className="filter-bar">
          <Field label="Search" className="grow">
            <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Action, user ya detail..." />
          </Field>
          <div className="filter-stats"><span><strong>{filtered.length}</strong> records</span></div>
        </div>
      </Card>

      {loading ? <Loading label="Audit log load ho raha hai..." /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <Card flush>
          {filtered.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th><th>Company</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="muted small">{fmtDateTime(r.created_at)}</td>
                      <td>{r.username || 'system'}</td>
                      <td><span className={`tag ${String(r.action).includes('DELETE') ? 'tag-bad' : String(r.action).includes('CREATE') ? 'tag-good' : ''}`}>{r.action}</span></td>
                      <td className="truncate" title={r.detail}>{r.detail || '—'}</td>
                      <td className="muted">{r.company_id || 'global'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Koi audit record nahi" icon="shield" />}
        </Card>
      )}
    </div>
  );
}
