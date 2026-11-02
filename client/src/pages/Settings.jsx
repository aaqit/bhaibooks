import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, downloadFile } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, PageHeader, SelectInput, Stat, TextInput, Toggle,
} from '../components/ui.jsx';
import { STATES, fmtDate, fmtDateTime } from '../utils.js';

const PROFILE_FIELDS = [
  ['name', 'Company name', 'text'],
  ['financial_year', 'Financial year', 'text'],
  ['books_from', 'Books beginning', 'date'],
  ['gstin', 'GSTIN', 'text'],
  ['pan', 'PAN', 'text'],
  ['city', 'City', 'text'],
  ['pincode', 'Pincode', 'text'],
  ['phone', 'Phone', 'text'],
  ['email', 'Email', 'email'],
];

function bytes(n) {
  const value = Number(n) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Settings() {
  const { companyId, companies, hasCap, refresh, isWeb, mode, user } = useAuth();
  const toast = useToast();
  const company = companies.find(c => c.id === companyId) || {};

  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  const [lockDate, setLockDate] = useState('');
  const [backups, setBackups] = useState([]);
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');

  const [rules, setRules] = useState({ stock_valuation: 'AVERAGE', expiry_alert_days: '30', credit_enforce: '1' });
  const [vault, setVault] = useState({ current_password: '', password: '', confirm: '' });
  const [vaultBusy, setVaultBusy] = useState(false);

  const canBackup = hasCap('backup') && !isWeb;
  const canSystem = hasCap('users') && !isWeb;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meta, s] = await Promise.all([
        api('/company/meta'),
        api('/company/settings'),
      ]);
      setProfile(meta.company || company);
      setSettings(s.settings || {});
      setLockDate(s.settings?.lock_date || '');
      setRules({
        stock_valuation: s.settings?.stock_valuation || 'AVERAGE',
        expiry_alert_days: s.settings?.expiry_alert_days || '30',
        credit_enforce: s.settings?.credit_enforce ?? '1',
      });
      if (canBackup) {
        try {
          const b = await api('/company/backups');
          setBackups(b.backups || []);
        } catch { setBackups([]); }
      }
      if (canSystem) {
        try { setSystem(await api('/admin/system')); } catch { setSystem(null); }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Settings & Backup · BahiBooks';
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const payload = {};
      for (const key of ['name', 'financial_year', 'books_from', 'currency', 'gstin', 'pan', 'address', 'city', 'state', 'pincode', 'phone', 'email']) {
        payload[key] = profile[key] ?? '';
      }
      const res = await api(`/companies/${companyId}`, { method: 'PATCH', body: payload });
      setProfile(res.company);
      toast.success(res.message || 'Company profile update ho gayi');
      await refresh();
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveLock = async () => {
    setSaving(true);
    try {
      const res = await api('/company/settings/lock-date', { method: 'POST', body: { lock_date: lockDate } });
      toast.success(res.message || 'Period lock update ho gaya');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      const res = await api('/company/settings', {
        method: 'POST',
        body: {
          stock_valuation: rules.stock_valuation,
          expiry_alert_days: rules.expiry_alert_days,
          credit_enforce: rules.credit_enforce === '1' || rules.credit_enforce === true,
        },
      });
      toast.success(res.message || 'Settings save ho gayi');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveVault = async (remove = false) => {
    if (!remove && vault.password !== vault.confirm) { toast.error('Naya password confirm nahi mil raha'); return; }
    if (!remove && vault.password.length < 4) { toast.error('Password kam se kam 4 character ka ho'); return; }
    setVaultBusy(true);
    try {
      const res = await api(`/companies/${companyId}/password`, {
        method: 'POST',
        body: { password: remove ? '' : vault.password, current_password: vault.current_password },
      });
      toast.success(res.message || 'Vault update ho gaya');
      setVault({ current_password: '', password: '', confirm: '' });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setVaultBusy(false);
    }
  };

  const createBackup = async () => {
    setBusy('create');
    try {
      const res = await api('/company/backup', { method: 'POST' });
      toast.success(`${res.file} ban gaya`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const downloadBackup = async () => {
    setBusy('download');
    try {
      await downloadFile('/company/backup/download', `${company?.name || 'company'}-backup.db`);
      toast.success('Backup download shuru ho gaya');
      if (canBackup) await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  if (loading) return <Loading label="Settings load ho rahi hain..." />;
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!profile) return <Empty title="Company profile nahi mili" icon="company" />;

  const set = (patch) => setProfile(p => ({ ...p, ...patch }));

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Administration"
        title="Settings & Backup"
        subtitle="Company profile, period lock, data backup aur system details — sab yahan."
        actions={<Button icon="refresh" onClick={load}>Refresh</Button>}
      />

      {isWeb && (
        <div className="info-panel warn">
          <Icon name="lock" />
          <p>Web mode me settings read-only hain. Profile edit, period lock aur backup sirf PC Desktop app se hote hain.</p>
        </div>
      )}

      <div className="grid grid-4">
        <Stat label="Financial year" value={profile.financial_year || '—'} foot={`Books from ${fmtDate(profile.books_from)}`} icon="calendar" />
        <Stat label="GSTIN" value={profile.gstin || 'NOT SET'} foot={profile.state || 'State not set'} icon="percent" tone={profile.gstin ? 'good' : 'warn'} />
        <Stat label="Period lock" value={settings.lock_date ? fmtDate(settings.lock_date) : 'Open'} foot={settings.lock_date ? 'Vouchers locked' : 'Saare dates open'} icon="lock" />
        <Stat label="Your role" value={user?.role?.replace(/_/g, ' ') || '—'} foot={mode === 'web' ? 'Web entry mode' : 'Desktop full mode'} icon="shield" />
      </div>

      <div className="grid grid-2">
        <Card title="Company profile" subtitle="Ye details invoice, GST returns aur reports me use hoti hain">
          <form onSubmit={saveProfile} className="stack">
            <div className="form-grid">
              {PROFILE_FIELDS.slice(0, 2).map(([key, label, type]) => (
                <Field key={key} label={label} className={key === 'name' ? 'span-2' : ''}>
                  <TextInput
                    type={type}
                    value={profile[key] || ''}
                    onChange={e => set({ [key]: key === 'gstin' || key === 'pan' ? e.target.value.toUpperCase() : e.target.value })}
                    readOnly={isWeb}
                    required={key === 'name'}
                  />
                </Field>
              ))}
              <Field label="Books beginning">
                <TextInput type="date" value={profile.books_from || ''} onChange={e => set({ books_from: e.target.value })} readOnly={isWeb} required />
              </Field>
              <Field label="Currency">
                <SelectInput value={profile.currency || 'INR'} onChange={e => set({ currency: e.target.value })} disabled={isWeb}>
                  {['INR'].map(c => <option key={c} value={c}>{c} — Indian Rupee</option>)}
                </SelectInput>
              </Field>
              <Field label="GSTIN">
                <TextInput value={profile.gstin || ''} onChange={e => set({ gstin: e.target.value.toUpperCase() })} readOnly={isWeb} maxLength={15} placeholder="24AABCS1429B1Z1" />
              </Field>
              <Field label="PAN">
                <TextInput value={profile.pan || ''} onChange={e => set({ pan: e.target.value.toUpperCase() })} readOnly={isWeb} maxLength={10} placeholder="AABCS1429B" />
              </Field>
              <Field label="State">
                <SelectInput value={profile.state || 'Gujarat'} onChange={e => set({ state: e.target.value })} disabled={isWeb}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </SelectInput>
              </Field>
              <Field label="City">
                <TextInput value={profile.city || ''} onChange={e => set({ city: e.target.value })} readOnly={isWeb} />
              </Field>
              <Field label="Pincode">
                <TextInput value={profile.pincode || ''} onChange={e => set({ pincode: e.target.value })} readOnly={isWeb} maxLength={6} />
              </Field>
              <Field label="Phone">
                <TextInput value={profile.phone || ''} onChange={e => set({ phone: e.target.value })} readOnly={isWeb} />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={profile.email || ''} onChange={e => set({ email: e.target.value })} readOnly={isWeb} />
              </Field>
              <Field label="Address" className="span-2">
                <TextInput value={profile.address || ''} onChange={e => set({ address: e.target.value })} readOnly={isWeb} />
              </Field>
            </div>
            {!isWeb && (
              <div className="form-actions">
                <Button variant="primary" type="submit" icon="save" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</Button>
              </div>
            )}
          </form>
        </Card>

        <div className="stack">
          <Card title="Inventory & credit rules" subtitle="Valuation method, expiry alert aur credit limit enforcement">
            <div className="stack">
              <Field label="Stock valuation method">
                <SelectInput value={rules.stock_valuation} onChange={e => setRules({ ...rules, stock_valuation: e.target.value })} disabled={isWeb}>
                  <option value="AVERAGE">Average Cost</option>
                  <option value="FIFO">FIFO (First In First Out)</option>
                  <option value="LPP">LPP (Last Purchase Price)</option>
                </SelectInput>
              </Field>
              <Field label="Expiry alert days" hint="Itne din ke andar expire hone wale batch alert honge.">
                <TextInput type="number" min="0" max="365" value={rules.expiry_alert_days} onChange={e => setRules({ ...rules, expiry_alert_days: e.target.value })} readOnly={isWeb} />
              </Field>
              <div className="info-panel">
                <Toggle
                  checked={rules.credit_enforce === '1' || rules.credit_enforce === true}
                  onChange={v => setRules({ ...rules, credit_enforce: v ? '1' : '0' })}
                  label="Credit limit + credit days enforce karo (Sales par)"
                />
              </div>
              {!isWeb && (
                <div className="form-actions">
                  <Button variant="primary" icon="save" onClick={saveRules} disabled={saving}>{saving ? 'Saving...' : 'Save rules'}</Button>
                </div>
              )}
            </div>
          </Card>

          <Card title="Company vault" subtitle="Alag company password — is company ka data extra lock">
            <div className="stack">
              <div className="info-panel">
                <Icon name="lock" size={16} />
                <p>
                  {company?.locked
                    ? 'Is company par vault password laga hua hai. Kholne ke liye company select karte waqt password maangta hai.'
                    : 'Vault password set karo — bina password ke is company ka data koi nahi khol payega (Super Admin chhod kar).'}
                </p>
              </div>
              {company?.locked && (
                <Field label="Purana company password">
                  <TextInput type="password" value={vault.current_password} onChange={e => setVault({ ...vault, current_password: e.target.value })} readOnly={isWeb} autoComplete="current-password" />
                </Field>
              )}
              <Field label="Naya company password" hint="Blank chhodo to lock hat jayega.">
                <TextInput type="password" value={vault.password} onChange={e => setVault({ ...vault, password: e.target.value })} readOnly={isWeb} autoComplete="new-password" />
              </Field>
              <Field label="Confirm password">
                <TextInput type="password" value={vault.confirm} onChange={e => setVault({ ...vault, confirm: e.target.value })} readOnly={isWeb} autoComplete="new-password" />
              </Field>
              {!isWeb && (
                <div className="form-actions">
                  <Button variant="primary" icon="lock" onClick={() => saveVault(false)} disabled={vaultBusy || !vault.password}>
                    {vaultBusy ? 'Saving...' : company?.locked ? 'Change password' : 'Set vault password'}
                  </Button>
                  {company?.locked && (
                    <Button variant="ghost" icon="close" onClick={() => saveVault(true)} disabled={vaultBusy}>Remove lock</Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title="Period lock" subtitle="Lock date se pehle ke vouchers edit ya delete nahi hoyenge">
            <div className="stack">
              <Field label="Books locked till" hint="Blank chhodo to lock hat jayega.">
                <TextInput type="date" value={lockDate} onChange={e => setLockDate(e.target.value)} readOnly={isWeb} />
              </Field>
              <div className="info-panel">
                <Icon name="shield" size={16} />
                <p>
                  Lock lagne ke baad us date tak ke voucher par POST, PUT aur DELETE server khud block karta hai.
                  Correction chahiye to pehle lock hatao — ye action audit log me record hoga.
                </p>
              </div>
              {!isWeb && (
                <div className="form-actions">
                  <Button variant="primary" icon="lock" onClick={saveLock} disabled={saving}>
                    {saving ? 'Saving...' : lockDate ? 'Apply lock' : 'Remove lock'}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card title="Company data" subtitle="Local folder isolation">
            <div className="detail-grid">
              <div><small>Company ID</small><strong className="mono">{companyId}</strong></div>
              <div><small>Data mode</small><strong>{mode === 'web' ? 'Web (limited)' : 'Desktop (full)'}</strong></div>
              <div><small>Books from</small><strong>{fmtDate(profile.books_from)}</strong></div>
              <div><small>Database</small><strong className="mono">{system ? bytes(system.company_db_size) : '—'}</strong></div>
            </div>
            {system && (
              <div className="stack">
                <div className="detail-grid">
                  <div><small>App version</small><strong>{system.version}</strong></div>
                  <div><small>Node</small><strong className="mono">{system.node}</strong></div>
                  <div><small>Platform</small><strong>{system.platform}</strong></div>
                  <div><small>Launcher</small><strong className="mono">{system.desktop_launcher}</strong></div>
                </div>
                <div className="folder-line">
                  <Icon name="file" size={15} />
                  <span className="mono">{system.company_folder}</span>
                </div>
              </div>
            )}
            {!canSystem && <p className="muted small" style={{ margin: 0 }}>System details sirf Super Admin ko dikhte hain.</p>}
          </Card>
        </div>
      </div>

      <Card
        title="Backup & restore"
        subtitle="Manual backup banao ya latest copy download karo. Automatic backup har 12 ghante me chalta hai."
        actions={canBackup ? (
          <div className="header-actions">
            <Button icon="download" onClick={downloadBackup} disabled={!!busy}>{busy === 'download' ? 'Downloading...' : 'Download latest'}</Button>
            <Button variant="primary" icon="save" onClick={createBackup} disabled={!!busy}>{busy === 'create' ? 'Creating...' : 'Create backup'}</Button>
          </div>
        ) : null}
      >
        {!canBackup ? (
          <div className="info-panel">
            <Icon name="lock" size={16} />
            <p>Aapke role ke paas backup permission nahi hai{isWeb ? ', aur web mode me backup available nahi hai' : ''}. Shop Owner ya Super Admin se karwao.</p>
          </div>
        ) : backups.length ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Backup file</th><th>Created</th><th className="text-right">Size</th><th /></tr></thead>
              <tbody>
                {backups.map(b => (
                  <tr key={b.name}>
                    <td className="mono">{b.name}</td>
                    <td>{fmtDateTime(b.created_at)}</td>
                    <td className="text-right mono">{bytes(b.size)}</td>
                    <td className="text-right">
                      <Button icon="download" onClick={downloadBackup} disabled={!!busy}>Download</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Abhi koi backup nahi hai"
            subtitle="Pehla backup banao — ye company ka poora SQLite database copy karta hai."
            icon="save"
            action={canBackup ? <Button variant="primary" icon="save" onClick={createBackup} disabled={!!busy}>Create first backup</Button> : null}
          />
        )}
        <div className="info-panel">
          <Icon name="alert" size={16} />
          <p>
            Restore karna ho to server band karo, backup file ko <span className="mono">data/companies/{companyId}/company.db</span> par replace karo,
            phir server start karo. Restore se pehle current data ka backup zaroor le lo.
          </p>
        </div>
      </Card>

      <Card title="Data safety" subtitle="BahiBooks local-first hai">
        <div className="info-stack">
          <div><Icon name="check" size={15} /><span>Har company ka data alag folder me — ek dukan ka hisaab dusri dukan ko nahi dikhta.</span></div>
          <div><Icon name="check" size={15} /><span>Voucher save hone se pehle server Dr = Cr verify karta hai; mismatch par save reject.</span></div>
          <div><Icon name="check" size={15} /><span>Period lock se purane records accidental edit se bachte hain.</span></div>
          <div><Icon name="check" size={15} /><span>Audit log me user, action aur detail — sab record hota hai.</span></div>
          <div><Icon name="alert" size={15} /><span>Backup ko pen drive ya external disk par bhi rakho. Sirf ek PC par rakhna safe nahi.</span></div>
        </div>
      </Card>
    </div>
  );
}
