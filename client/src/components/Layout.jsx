import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Button, Field, Icon, Modal, SelectInput, TextInput } from './ui.jsx';
import { SHORTCUTS } from '../utils.js';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/select-company': 'Companies',
  '/vouchers/new': 'New Voucher',
  '/daybook': 'Daybook',
  '/masters/ledgers': 'Ledgers',
  '/masters/stock': 'Stock Items',
  '/masters/godowns': 'Godowns',
  '/masters/groups': 'Groups',
  '/reports/trial-balance': 'Trial Balance',
  '/reports/profit-loss': 'Profit & Loss',
  '/reports/balance-sheet': 'Balance Sheet',
  '/reports/stock-summary': 'Stock Summary',
  '/reports/ledger-book': 'Ledger Book',
  '/reports/cash-flow': 'Cash Flow',
  '/reports/funds-flow': 'Funds Flow',
  '/reports/bill-wise': 'Bill-wise Outstanding',
  '/reports/expiry-alerts': 'Expiry Alerts',
  '/reports/brs': 'Bank Reconciliation',
  '/gst': 'GST Center',
  '/admin/users': 'Users & Roles',
  '/admin/audit': 'Audit Log',
  '/settings': 'Settings',
};

function pageTitle(pathname) {
  if (pathname.startsWith('/vouchers/new')) return 'New Voucher';
  if (pathname.startsWith('/masters')) return PAGE_TITLES[pathname] || 'Masters';
  if (pathname.startsWith('/reports')) return PAGE_TITLES[pathname] || 'Reports';
  if (pathname.startsWith('/admin')) return PAGE_TITLES[pathname] || 'Administration';
  return PAGE_TITLES[pathname] || 'BahiBooks';
}

export default function Layout() {
  const {
    user, companies, companyId, setCompanyId, mode, logout, hasCap, isWeb,
  } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultPwd, setVaultPwd] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);

  const company = companies.find(c => c.id === companyId);
  const title = pageTitle(location.pathname);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === 'F3') {
        e.preventDefault();
        setCompanyOpen(true);
        return;
      }
      if (e.ctrlKey || e.altKey) {
        if (e.altKey && e.key === 'F5' && hasCap('voucher:create')) { e.preventDefault(); navigate('/vouchers/new/DEBIT_NOTE'); }
        if (e.altKey && e.key === 'F6' && hasCap('voucher:create')) { e.preventDefault(); navigate('/vouchers/new/CREDIT_NOTE'); }
        return;
      }
      const map = { F1: 'help', F4: 'CONTRA', F5: 'PAYMENT', F6: 'RECEIPT', F7: 'JOURNAL', F8: 'SALES', F9: 'PURCHASE' };
      if (e.key === 'Escape') {
        setCompanyOpen(false); setHelpOpen(false); setPasswordOpen(false); setSidebarOpen(false);
      }
      if (!map[e.key]) return;
      e.preventDefault();
      if (e.key === 'F1') { setHelpOpen(true); return; }
      if (hasCap('voucher:create')) navigate(`/vouchers/new/${map[e.key]}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, hasCap]);

  useEffect(() => {
    const onLocked = () => { setVaultPwd(''); setVaultOpen(true); };
    window.addEventListener('bahi:company-locked', onLocked);
    return () => window.removeEventListener('bahi:company-locked', onLocked);
  }, []);

  const unlockVault = async (e) => {
    e.preventDefault();
    if (!companyId) return;
    setVaultBusy(true);
    try {
      await api(`/companies/${companyId}/unlock`, { method: 'POST', body: { password: vaultPwd } });
      toast.success('Company vault unlock ho gaya');
      setVaultOpen(false);
      setVaultPwd('');
      window.location.reload();
    } catch (err) { toast.error(err.message); }
    finally { setVaultBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.new_password !== pwd.confirm) { toast.error('Naya password confirm nahi mil raha'); return; }
    setSaving(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: pwd.current_password, new_password: pwd.new_password } });
      toast.success('Password update ho gaya');
      setPasswordOpen(false);
      setPwd({ current_password: '', new_password: '', confirm: '' });
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const nav = [
    { section: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', cap: 'dashboard', end: true }] },
    { section: 'Transactions', items: [
      { to: '/vouchers/new/SALES', label: 'New Voucher', icon: 'voucher', cap: 'voucher:create', hint: 'F8' },
      { to: '/daybook', label: 'Daybook', icon: 'book', cap: 'daybook', desktop: true },
    ] },
    { section: 'Masters', items: [
      { to: '/masters/ledgers', label: 'Ledgers', icon: 'company', cap: 'master:read', desktop: true },
      { to: '/masters/stock', label: 'Stock Items', icon: 'box', cap: 'master:read', desktop: true },
      { to: '/masters/godowns', label: 'Godowns', icon: 'truck', cap: 'master:read', desktop: true },
      { to: '/masters/groups', label: 'Groups', icon: 'book', cap: 'master:read', desktop: true },
    ] },
    { section: 'Reports', items: [
      { to: '/reports/trial-balance', label: 'Trial Balance', icon: 'chart', cap: 'reports:financial', desktop: true },
      { to: '/reports/profit-loss', label: 'Profit & Loss', icon: 'trend', cap: 'reports:financial', desktop: true },
      { to: '/reports/balance-sheet', label: 'Balance Sheet', icon: 'file', cap: 'reports:financial', desktop: true },
      { to: '/reports/cash-flow', label: 'Cash Flow', icon: 'cash', cap: 'reports:financial', desktop: true },
      { to: '/reports/funds-flow', label: 'Funds Flow', icon: 'trend', cap: 'reports:financial', desktop: true },
      { to: '/reports/bill-wise', label: 'Bill-wise Outstanding', icon: 'banknote', cap: 'reports:financial', desktop: true },
      { to: '/reports/stock-summary', label: 'Stock Summary', icon: 'box', cap: 'stock', desktop: true },
      { to: '/reports/expiry-alerts', label: 'Expiry Alerts', icon: 'alert', cap: 'stock', desktop: true },
      { to: '/reports/ledger-book', label: 'Ledger Book', icon: 'book', cap: 'reports', desktop: true },
      { to: '/reports/brs', label: 'Bank Reconciliation', icon: 'bank', cap: 'brs', desktop: true },
    ] },
    { section: 'GST & Compliance', items: [
      { to: '/gst', label: 'GST Center', icon: 'percent', cap: 'gst', desktop: true },
    ] },
    { section: 'Administration', items: [
      { to: '/admin/users', label: 'Users & Roles', icon: 'users', cap: 'users', desktop: true },
      { to: '/admin/audit', label: 'Audit Log', icon: 'shield', cap: 'audit', desktop: true },
      { to: '/settings', label: 'Settings & Backup', icon: 'settings', cap: 'settings', desktop: true },
    ] },
  ];

  const visibleNav = nav.map(section => ({
    ...section,
    items: section.items.filter(item => hasCap(item.cap) && (!item.desktop || !isWeb)),
  })).filter(section => section.items.length);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">B</div>
          <div className="brand-text">
            <h1>BahiBooks</h1>
            <p>Smart Books · Har Dukan Ke Liye</p>
          </div>
        </div>

        {visibleNav.map(section => (
          <div className="sidebar-section" key={section.section}>
            <div className="section-title">{section.section}</div>
            <div className="nav-list">
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="nav-left"><Icon name={item.icon} size={17} /> {item.label}</span>
                  {item.hint && <span className="nav-subtle">{item.hint}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {isWeb && (
          <div className="web-lock-card">
            <Icon name="lock" size={16} />
            <div>
              <strong>Web Entry Mode</strong>
              <p>Sirf Dashboard aur voucher entry. Poora Tally suite PC Desktop app me available hai.</p>
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          <button type="button" className="company-card" onClick={() => setCompanyOpen(true)}>
            <small>Current company</small>
            <strong>{company?.name || 'Select company'}</strong>
            <span>{company ? `${company.financial_year} · ${company.state}` : 'Alt + F3'}</span>
          </button>
          <div className="user-card">
            <div className="avatar">{(user?.full_name || user?.username || 'B').slice(0, 1).toUpperCase()}</div>
            <div className="user-meta">
              <p>{user?.full_name}</p>
              <small>{user?.role?.replace(/_/g, ' ')}</small>
            </div>
            <button type="button" className="ghost-btn" onClick={() => setPasswordOpen(true)} title="Change password"><Icon name="settings" size={16} /></button>
            <button type="button" className="ghost-btn" onClick={logout} title="Logout"><Icon name="logout" size={16} /></button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-btn menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
            <div className="breadcrumbs">
              <span>{company?.name || 'BahiBooks'}</span>
              <Icon name="arrow" size={12} />
              <strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className={`mode-chip ${isWeb ? 'mode-web' : 'mode-desktop'}`}>
              <span className="chip-dot" /> {isWeb ? 'Web Entry' : 'Desktop Full'}
            </span>
            <button type="button" className="company-pill" onClick={() => setCompanyOpen(true)}>
              <Icon name="company" size={15} /> <span>{company?.name || 'Select company'}</span>
            </button>
            <button type="button" className="icon-btn hide-mobile" onClick={() => setHelpOpen(true)} aria-label="Shortcuts"><Icon name="help" /></button>
          </div>
        </header>

        <main className="content" key={companyId || 'no-company'}>
          <Outlet />
        </main>

        <nav className="mobile-nav">
          <NavLink to="/" end className="mobile-link"><Icon name="dashboard" size={20} /><span>Dashboard</span></NavLink>
          <NavLink to="/vouchers/new/SALES" className="mobile-link"><Icon name="plus" size={20} /><span>New Entry</span></NavLink>
          {hasCap('daybook') ? (
            <NavLink to="/daybook" className="mobile-link"><Icon name="book" size={20} /><span>Daybook</span></NavLink>
          ) : (
            <button type="button" className="mobile-link" onClick={() => setCompanyOpen(true)}><Icon name="company" size={20} /><span>Company</span></button>
          )}
          <button type="button" className="mobile-link" onClick={() => setHelpOpen(true)}><Icon name="help" size={20} /><span>Help</span></button>
        </nav>
      </div>

      <Modal open={companyOpen} onClose={() => setCompanyOpen(false)} title="Switch company" subtitle="Alt + F3 · Har company ka data alag folder me safe hai" width={620}>
        <div className="company-list">
          {companies.map(c => (
            <button
              type="button"
              key={c.id}
              className={`company-option ${c.id === companyId ? 'active' : ''}`}
              onClick={() => {
                setCompanyId(c.id);
                setCompanyOpen(false);
                navigate('/');
                toast.success(`${c.name} select ho gayi`);
              }}
            >
              <span className="company-avatar"><Icon name="company" /></span>
              <span className="company-option-main">
                <strong>{c.name}</strong>
                <small>{c.financial_year} · GSTIN {c.gstin || '—'} · {c.state}</small>
              </span>
              {c.id === companyId && <Icon name="check" size={18} />}
            </button>
          ))}
          {!companies.length && <p className="muted">Koi company nahi mili. Super Admin se company create karwao.</p>}
        </div>
        <div className="modal-inline-actions">
          <Button variant="ghost" icon="settings" onClick={() => { setCompanyOpen(false); navigate('/select-company'); }}>Manage companies</Button>
          <Button variant="primary" icon="close" onClick={() => setCompanyOpen(false)}>Close</Button>
        </div>
      </Modal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" subtitle="Tally style speed, modern UI" width={640}>
        <div className="shortcut-grid">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="shortcut-row"><kbd>{s.keys}</kbd><span>{s.action}</span></div>
          ))}
        </div>
        <div className="info-panel">
          <Icon name="shield" />
          <p><strong>Role:</strong> {user?.full_name} · {user?.role?.replace(/_/g, ' ')}. Permissions server-side enforce hoti hain — sirf UI hide nahi hota.</p>
        </div>
        {isWeb && <div className="info-panel warn"><Icon name="lock" /><p>Web Entry Mode: Dashboard aur Voucher Entry allowed. Reports, masters, GST aur admin sirf PC Desktop app me.</p></div>}
      </Modal>

      <Modal open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Change password" subtitle={user?.username} width={460}>
        <form onSubmit={changePassword} className="stack">
          <Field label="Current password"><TextInput type="password" value={pwd.current_password} onChange={e => setPwd({ ...pwd, current_password: e.target.value })} required autoComplete="current-password" /></Field>
          <Field label="New password"><TextInput type="password" value={pwd.new_password} onChange={e => setPwd({ ...pwd, new_password: e.target.value })} required minLength={6} autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><TextInput type="password" value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} required autoComplete="new-password" /></Field>
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" icon="save" disabled={saving}>{saving ? 'Saving...' : 'Update password'}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={vaultOpen} onClose={() => setVaultOpen(false)} title="Company vault locked" subtitle={company?.name || companyId} width={440}>
        <form onSubmit={unlockVault} className="stack">
          <div className="info-panel">
            <Icon name="lock" size={16} />
            <p>Is company par alag vault password laga hai. Aage badhne ke liye password daalo.</p>
          </div>
          <Field label="Company password">
            <TextInput type="password" value={vaultPwd} onChange={e => setVaultPwd(e.target.value)} required autoFocus autoComplete="current-password" />
          </Field>
          <div className="modal-inline-actions">
            <Button variant="ghost" type="button" icon="company" onClick={() => { setVaultOpen(false); navigate('/select-company'); }}>Switch company</Button>
            <Button variant="primary" type="submit" icon="lock" disabled={vaultBusy}>{vaultBusy ? 'Unlocking...' : 'Unlock'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
