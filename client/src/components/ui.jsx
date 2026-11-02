import { useEffect } from 'react';
import { fmtNumber } from '../utils.js';

const ICON_PATHS = {
  dashboard: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  voucher: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  book: ['M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z', 'M8 3v18', 'M12 8h4M12 12h4'],
  box: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4', 'M12 11v10'],
  chart: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  percent: ['M19 5L5 19', 'M7 6.5a1.5 1.5 0 1 0 0 .1M17 17.5a1.5 1.5 0 1 0 0 .1'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.35.7.6 1 .3.27.7.42 1.1.4h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.1.6z'],
  menu: ['M3 6h18M3 12h18M3 18h18'],
  plus: ['M12 5v14M5 12h14'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.35-4.35'],
  print: ['M6 9V2h12v7', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v8H6z'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  close: ['M18 6L6 18M6 6l12 12'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  check: ['M20 6L9 17l-5-5'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  bank: ['M3 10l9-6 9 6', 'M4 10h16v9H4z', 'M8 19v-5M12 19v-5M16 19v-5'],
  cash: ['M2 7h20v10H2z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M6 10h.01M18 14h.01'],
  company: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 21v-6h6v6', 'M9 9h.01M15 9h.01'],
  calendar: ['M3 5h18v16H3z', 'M8 3v4M16 3v4M3 11h18'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 15H6L5 6', 'M10 11v6M14 11v6'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2', 'M7 3v6h8', 'M7 21v-7h10v7'],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.5 9a9 9 0 0 1 14.9-3.4L23 10', 'M20.5 15a9 9 0 0 1-14.9 3.4L1 14'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  help: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  banknote: ['M2 7h20v10H2z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5'],
  truck: ['M1 3h15v13H1z', 'M16 8h4l3 4v4h-7z', 'M5.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8M8 17h5'],
  trend: ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
};

export function Icon({ name, size = 18, className = '' }) {
  const paths = ICON_PATHS[name] || ICON_PATHS.file;
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Button({ children, variant = '', icon, size = '', type = 'button', className = '', ...props }) {
  return (
    <button type={type} className={`btn ${variant ? `btn-${variant}` : ''} ${size ? `btn-${size}` : ''} ${className}`} {...props}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, flush = false, className = '', bodyClass = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="header-actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? 'card-body flush' : `card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, foot, icon, tone = 'default' }) {
  return (
    <div className={`card stat-card stat-${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon"><Icon name={icon} size={18} /></span>}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

export function Badge({ tone = 'default', children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`field-control ${className}`} {...props} />;
}

export function SelectInput({ children, className = '', ...props }) {
  return <select className={`field-control ${className}`} {...props}>{children}</select>;
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`field-control ${className}`} rows={3} {...props} />;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="search-box">
      <Icon name="search" size={16} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 560 }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title = 'Kuch nahi mila', subtitle, action, icon = 'file' }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={30} /></div>
      <h4>{title}</h4>
      {subtitle && <p>{subtitle}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading...' }) {
  return <div className="loading"><span className="spinner" /> {label}</div>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box">
      <Icon name="alert" />
      <div>
        <strong>Kuch galat hua</strong>
        <p>{error?.message || 'Unknown error'}</p>
      </div>
      {onRetry && <Button variant="ghost" onClick={onRetry} icon="refresh">Retry</Button>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.value} type="button" className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function MiniBars({ data = [], height = 140 }) {
  const max = Math.max(1, ...data.flatMap(d => [d.sales || 0, d.purchases || 0]));
  return (
    <div className="mini-bars" style={{ height }}>
      {data.map((d, i) => (
        <div className="mini-bar-group" key={i}>
          <div className="mini-bar-pair">
            <div className="mini-bar bar-sales" style={{ height: `${Math.max(3, ((d.sales || 0) / max) * (height - 34))}px` }} title={`Sales ₹${fmtNumber(d.sales)}`} />
            <div className="mini-bar bar-purchase" style={{ height: `${Math.max(3, ((d.purchases || 0) / max) * (height - 34))}px` }} title={`Purchase ₹${fmtNumber(d.purchases)}`} />
          </div>
          <span>{d.month?.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle" />
      {label && <span>{label}</span>}
    </label>
  );
}
