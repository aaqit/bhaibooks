import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import {
  Button, Card, ErrorBox, Icon, Loading, MiniBars, PageHeader, Stat,
} from '../components/ui.jsx';
import { fmtDate, money, voucherLabel, voucherTone } from '../utils.js';

const QUICK = [
  { type: 'SALES', label: 'Sales', shortcut: 'F8', icon: 'trend' },
  { type: 'PURCHASE', label: 'Purchase', shortcut: 'F9', icon: 'truck' },
  { type: 'PAYMENT', label: 'Payment', shortcut: 'F5', icon: 'cash' },
  { type: 'RECEIPT', label: 'Receipt', shortcut: 'F6', icon: 'banknote' },
  { type: 'CONTRA', label: 'Contra', shortcut: 'F4', icon: 'bank' },
  { type: 'JOURNAL', label: 'Journal', shortcut: 'F7', icon: 'book' },
];

export default function Dashboard() {
  const { companyId, companies, hasCap, isWeb, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const company = companies.find(c => c.id === companyId);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api('/reports/dashboard');
      setData(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Dashboard · BahiBooks';
    load();
  }, [companyId]);

  if (loading) return <Loading label="Dashboard load ho raha hai..." />;
  if (error) return <ErrorBox error={error} onRetry={load} />;

  const d = data || {};
  const recent = d.recent || [];
  const monthly = (d.monthly || []).slice(-6);
  const lowStock = d.lowStock || 0;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={isWeb ? 'Web entry mode' : 'PC desktop mode'}
        title={`Namaste, ${user?.full_name?.split(' ')[0] || 'ji'}`}
        subtitle={`${company?.name || ''} · FY ${company?.financial_year || ''} · ${fmtDate(d.period?.from)} se ${fmtDate(d.period?.to)}`}
        actions={(
          <>
            <Button icon="refresh" onClick={load}>Refresh</Button>
            {hasCap('voucher:create') && <Button variant="primary" icon="plus" onClick={() => navigate('/vouchers/new/SALES')}>New sale</Button>}
          </>
        )}
      />

      {isWeb && (
        <div className="info-panel warn">
          <Icon name="lock" />
          <p><strong>Web Entry Mode:</strong> aap dashboard dekh sakte ho aur voucher entry kar sakte ho. Masters, reports, GST aur admin sirf PC app me available hain.</p>
        </div>
      )}

      <div className="grid grid-4">
        <Stat label="Sales (period)" value={money(d.sales?.amount)} foot={`${d.sales?.count || 0} invoices`} icon="trend" tone="good" />
        <Stat label="Purchases" value={money(d.purchases?.amount)} foot={`${d.purchases?.count || 0} bills`} icon="truck" />
        <Stat label="Receivables" value={money(d.receivables)} foot="Sundry debtors" icon="banknote" tone={d.receivables > 0 ? 'warn' : 'default'} />
        <Stat label="Payables" value={money(d.payables)} foot="Sundry creditors" icon="cash" tone={d.payables > 0 ? 'bad' : 'default'} />
      </div>

      <div className="grid grid-4">
        <Stat label="Cash + Bank" value={money(d.cashBank)} foot="Live balance" icon="bank" />
        <Stat label="Stock value" value={money(d.stockValue)} foot={`${d.stockItems || 0} items${lowStock ? ` · ${lowStock} low` : ''}`} icon="box" />
        <Stat label="GST payable" value={money(d.gstPayable)} foot="Current period estimate" icon="percent" tone={d.gstPayable > 0 ? 'warn' : 'good'} />
        <Stat label="Receipts" value={money(d.receipts?.amount)} foot={`Payments ${money(d.payments?.amount)}`} icon="download" />
      </div>

      <div className="grid dashboard-main">
        <Card
          title="Monthly movement"
          subtitle="Sales vs purchases · last 6 months"
          actions={<span className="legend"><span className="legend-dot sales" /> Sales <span className="legend-dot purchase" /> Purchase</span>}
        >
          {monthly.length ? <MiniBars data={monthly} height={190} /> : <div className="empty">Abhi koi voucher nahi hai.</div>}
        </Card>

        <Card
          title="Quick entry"
          subtitle="Tally shortcuts yaad hain? Seedha enter karo."
          actions={<Link className="link-inline" to="/daybook">Daybook <Icon name="arrow" size={14} /></Link>}
        >
          <div className="quick-grid">
            {QUICK.map(q => (
              <button
                key={q.type}
                type="button"
                className="quick-card"
                disabled={!hasCap('voucher:create')}
                onClick={() => navigate(`/vouchers/new/${q.type}`)}
              >
                <span className="quick-icon"><Icon name={q.icon} size={18} /></span>
                <strong>{q.label}</strong>
                <kbd>{q.shortcut}</kbd>
              </button>
            ))}
          </div>
          <div className="quick-notes">
            <div><Icon name="check" size={15} /><span>Server har voucher par Dr = Cr check karta hai.</span></div>
            <div><Icon name="check" size={15} /><span>GST intra-state par CGST + SGST, inter-state par IGST auto split.</span></div>
            <div><Icon name="check" size={15} /><span>Invoice print sirf browser se — PDF save kar sakte ho.</span></div>
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card
          title="Recent vouchers"
          subtitle="Latest 8 entries"
          flush
          actions={<Link className="link-inline" to="/daybook">View daybook <Icon name="arrow" size={14} /></Link>}
        >
          {recent.length ? (
            <div className="table-wrapper">
              <table className="table table-compact">
                <thead>
                  <tr><th>Date</th><th>Voucher</th><th>Account</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {recent.map(v => (
                    <tr key={v.id}>
                      <td>{fmtDate(v.date)}</td>
                      <td>
                        <span className="voucher-cell">
                          <span className={`tag tag-${voucherTone(v.type)}`}>{voucherLabel(v.type)}</span>
                          <span className="mono">{v.number}</span>
                        </span>
                      </td>
                      <td>{v.account_name || '—'}</td>
                      <td className="text-right mono">{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">Koi voucher nahi mila.</div>}
        </Card>

        <Card title="Top outstanding" subtitle="Jinka paisa aana baaki hai">
          {(d.topDebtors || []).length ? (
            <div className="list-panel">
              {d.topDebtors.map((c, i) => (
                <div key={c.id} className="outstanding-row">
                  <span className="rank">{i + 1}</span>
                  <span className="outstanding-name">{c.name}</span>
                  <span className="mono">{money(c.balance)}</span>
                </div>
              ))}
            </div>
          ) : <div className="empty">Sab payments clear hain.</div>}
          <div className="mini-metrics">
            <div><small>Stock items</small><strong>{d.stockItems || 0}</strong></div>
            <div><small>Low stock</small><strong className={lowStock ? 'text-warn' : ''}>{lowStock}</strong></div>
            <div><small>GST period</small><strong>{d.gstPeriod ? `${fmtDate(d.gstPeriod.from)} – ${fmtDate(d.gstPeriod.to)}` : '—'}</strong></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
