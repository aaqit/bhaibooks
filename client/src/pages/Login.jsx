import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Field, Icon, TextInput } from '../components/ui.jsx';

const DEMO_USERS = [
  { username: 'admin', password: 'admin123', role: 'Super Admin', note: 'Sab kuch' },
  { username: 'owner', password: 'owner123', role: 'Shop Owner', note: 'Full minus users' },
  { username: 'manager', password: 'manager123', role: 'Manager', note: 'Operations' },
  { username: 'operator', password: 'operator123', role: 'Operator', note: 'Entry only' },
  { username: 'auditor', password: 'auditor123', role: 'CA Auditor', note: 'Read only' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    document.title = 'Login · BahiBooks ERP';
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.username.trim(), form.password);
      const target = location.state?.from || '/';
      if (!data.companies?.length) navigate('/select-company', { replace: true });
      else navigate(target === '/login' ? '/' : target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (u) => {
    setForm({ username: u.username, password: u.password });
    setError('');
  };

  return (
    <div className="auth-screen">
      <div className="auth-hero">
        <div>
          <div className="brand" style={{ marginBottom: 40 }}>
            <div className="brand-mark">B</div>
            <div className="brand-text">
              <h1>BahiBooks</h1>
              <p>Smart Books · Har Dukan Ke Liye</p>
            </div>
          </div>
          <h2 className="auth-title">Tally jaisa poora hisaab,<br />ab PC aur mobile dono par.</h2>
          <p className="auth-sub">
            Double-entry accounting, GST returns, inventory aur reports — sab kuch ek local-first app me.
            PC par full suite, web par sirf entry aur dashboard.
          </p>
          <div className="auth-points">
            <div><Icon name="check" size={16} /> Dr = Cr server-side validate, galti ka scope zero</div>
            <div><Icon name="check" size={16} /> Har company ka alag data folder aur backup</div>
            <div><Icon name="check" size={16} /> Sales, Purchase, Payment, Receipt, Contra, Journal, Notes</div>
            <div><Icon name="check" size={16} /> GSTR-1, GSTR-3B, Trial Balance, P&L, Balance Sheet</div>
            <div><Icon name="check" size={16} /> Role-based access — Owner, Manager, Operator, CA</div>
          </div>
        </div>
        <div className="auth-foot">
          <span>Local-first · Installable PWA · Made for Indian shops</span>
        </div>
      </div>

      <div className="auth-card">
        <form className="auth-form" onSubmit={submit}>
          <div>
            <div className="eyebrow">Welcome back</div>
            <h2 style={{ margin: '4px 0' }}>Login karo</h2>
            <p className="muted" style={{ margin: 0 }}>Company ka hisaab continue karne ke liye sign in karo.</p>
          </div>

          {error && <div className="form-error"><Icon name="alert" size={16} /> {error}</div>}

          <Field label="Username">
            <TextInput
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          <Button variant="primary" type="submit" icon="logout" disabled={loading} className="btn-block">
            {loading ? 'Checking...' : 'Sign in'}
          </Button>

          <button type="button" className="link-btn" onClick={() => setShowDemo(v => !v)}>
            {showDemo ? 'Demo logins hide karo' : 'Demo logins dekho'}
          </button>

          {showDemo && (
            <div className="demo-list">
              {DEMO_USERS.map(u => (
                <button type="button" key={u.username} className="demo-row" onClick={() => quickFill(u)}>
                  <span>
                    <strong>{u.username}</strong>
                    <small>{u.role} · {u.note}</small>
                  </span>
                  <code>{u.password}</code>
                </button>
              ))}
              <p className="muted small">Demo account par click karo, fields auto-fill ho jayengi. Pehle login ke baad password change karna.</p>
            </div>
          )}

          <div className="auth-note">
            <Icon name="shield" size={15} />
            <span>Aapka data sirf is PC par rehta hai. Koi cloud upload nahi.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
