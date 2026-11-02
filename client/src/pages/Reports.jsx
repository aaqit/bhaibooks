import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, PageHeader, SelectInput, TextInput,
} from '../components/ui.jsx';
import { downloadCSV, fmtDate, fyStartISO, money, monthStartISO, todayISO } from '../utils.js';

const TITLES = {
  'trial-balance': { title: 'Trial Balance', subtitle: 'Saare ledgers ka closing Dr / Cr — books balanced hone chahiye.' },
  'profit-loss': { title: 'Profit & Loss', subtitle: 'Direct income/expense se gross profit, phir indirect se net profit.' },
  'balance-sheet': { title: 'Balance Sheet', subtitle: 'Assets = Liabilities + Equity. Difference 0 hona chahiye.' },
  'stock-summary': { title: 'Stock Summary', subtitle: 'Opening + inward − outward, Average / FIFO / LPP valuation par.' },
  'ledger-book': { title: 'Ledger Book', subtitle: 'Kisi bhi ledger ka opening, entries, running balance aur closing.' },
  'cash-flow': { title: 'Cash Flow', subtitle: 'Period ka cash + bank inflow/outflow aur opening/closing balance.' },
  'funds-flow': { title: 'Funds Flow', subtitle: 'Funds ke sources aur applications — balance sheet items ka movement.' },
  'bill-wise': { title: 'Bill-wise Outstanding', subtitle: 'Invoice-wise receivable/payable, due date aur overdue tracking.' },
  'expiry-alerts': { title: 'Expiry Alerts', subtitle: 'Batch-wise stock expiry — expired aur near-expiry items.' },
  brs: { title: 'Bank Reconciliation', subtitle: 'Bank entries clear karo, book vs reconciled balance dekho.' },
};

export default function Reports({ mode }) {
  const meta = TITLES[mode] || TITLES['trial-balance'];
  return (
    <div className="stack-lg">
      <PageHeader eyebrow="Reports" title={meta.title} subtitle={meta.subtitle} />
      {mode === 'trial-balance' && <TrialBalance />}
      {mode === 'profit-loss' && <ProfitLoss />}
      {mode === 'balance-sheet' && <BalanceSheet />}
      {mode === 'stock-summary' && <StockSummary />}
      {mode === 'ledger-book' && <LedgerBook />}
      {mode === 'cash-flow' && <CashFlow />}
      {mode === 'funds-flow' && <FundsFlow />}
      {mode === 'bill-wise' && <BillWise />}
      {mode === 'expiry-alerts' && <ExpiryAlerts />}
      {mode === 'brs' && <BRS />}
    </div>
  );
}

function ReportShell({ title, subtitle, actions, children, loading, error, onRetry }) {
  if (loading) return <Loading label="Report calculate ho rahi hai..." />;
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  return <Card title={title} subtitle={subtitle} actions={actions} flush>{children}</Card>;
}

// ---------------------------------------------------------------------------

function TrialBalance() {
  const { companyId } = useAuth();
  const [asOn, setAsOn] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/trial-balance?as_on=${asOn}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Trial Balance · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const groups = useMemo(() => {
    const out = [];
    const walk = (nodes, depth = 0) => {
      for (const g of nodes || []) {
        const totalRows = (g.ledgers || []).length + (g.children || []).length;
        if (totalRows > 0 && (g.debit || g.credit)) out.push({ ...g, depth });
        walk(g.children, depth + 1);
      }
    };
    walk(data?.tree || []);
    return out;
  }, [data]);

  const exportCSV = () => {
    const rows = [['Group', 'Ledger', 'Debit', 'Credit']];
    for (const r of data?.rows || []) rows.push([r.group_name, r.name, r.debit, r.credit]);
    rows.push(['', 'TOTAL', data?.totalDr, data?.totalCr]);
    downloadCSV(`trial_balance_${asOn}.csv`, rows);
  };

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="As on"><TextInput type="date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Total Dr <strong className="mono">{money(data.totalDr)}</strong></span>
            <span>Total Cr <strong className="mono">{money(data.totalCr)}</strong></span>
            <span className={data.balanced ? 'tag tag-good' : 'tag tag-bad'}>
              {data.balanced ? 'Balanced ✓' : `Difference ${money(data.difference)}`}
            </span>
          </div>
        )}
      </Card>

      <ReportShell title="Trial Balance" subtitle={`As on ${fmtDate(asOn)}`} loading={loading} error={error} onRetry={load}>
        {data ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody>
                {groups.map(g => (
                  <GroupRows key={g.id} group={g} expanded={expanded} setExpanded={setExpanded} />
                ))}
                <tr className="total-row">
                  <td>Grand Total</td>
                  <td className="text-right mono">{money(data.totalDr)}</td>
                  <td className="text-right mono">{money(data.totalCr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </ReportShell>
    </div>
  );
}

function GroupRows({ group, expanded, setExpanded }) {
  const open = expanded[group.id] !== false;
  const hasChildren = (group.ledgers || []).length > 0 || (group.children || []).length > 0;
  return (
    <>
      <tr className="group-row" onClick={() => hasChildren && setExpanded({ ...expanded, [group.id]: !open })}>
        <td style={{ paddingLeft: 20 + (group.depth || 0) * 14 }}>
          {hasChildren && <span className="tree-caret">{open ? '▾' : '▸'}</span>}
          <strong>{group.name}</strong>
        </td>
        <td className="text-right mono">{money(group.debit)}</td>
        <td className="text-right mono">{money(group.credit)}</td>
      </tr>
      {open && (group.children || []).map(c => <GroupRows key={c.id} group={{ ...c, depth: (group.depth || 0) + 1 }} expanded={expanded} setExpanded={setExpanded} />)}
      {open && (group.ledgers || []).map(l => (
        <tr key={`l-${l.id}`}>
          <td style={{ paddingLeft: 40 + (group.depth || 0) * 14 }}>{l.name}</td>
          <td className="text-right mono">{l.debit ? money(l.debit) : '—'}</td>
          <td className="text-right mono">{l.credit ? money(l.credit) : '—'}</td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function ProfitLoss() {
  const { companyId } = useAuth();
  const [range, setRange] = useState({ from: fyStartISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/profit-loss?from=${range.from}&to=${range.to}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Profit & Loss · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCSV = () => {
    const rows = [['Section', 'Ledger', 'Amount']];
    const push = (label, list) => { for (const l of list || []) rows.push([label, l.name, l.amount]); };
    push('Direct Income', data?.directIncome);
    push('Direct Expense', data?.directExpense);
    push('Indirect Income', data?.indirectIncome);
    push('Indirect Expense', data?.indirectExpense);
    rows.push(['', 'Gross Profit', data?.grossProfit]);
    rows.push(['', 'Net Profit', data?.netProfit]);
    downloadCSV(`profit_loss_${range.from}_${range.to}.csv`, rows);
  };

  const Section = ({ title, list, total, tone }) => (
    <div className="pl-section">
      <div className="pl-head"><strong>{title}</strong><span className="mono">{money(total)}</span></div>
      {(list || []).map(l => (
        <div className="pl-row" key={l.id}>
          <span>{l.name}</span>
          <span className="mono">{money(l.amount)}</span>
        </div>
      ))}
      {!(list || []).length && <div className="pl-row muted"><span>Koi entry nahi</span><span /></div>}
    </div>
  );

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="From"><TextInput type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </Card>

      <ReportShell title="Profit & Loss Statement" subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`} loading={loading} error={error} onRetry={load}>
        {data && (
          <div className="pl-grid">
            <div>
              <Section title="Direct Income" list={data.directIncome} total={data.totals.directIncome} />
              <Section title="Direct Expenses" list={data.directExpense} total={data.totals.directExpense} />
              <div className="pl-profit">
                <span>Gross Profit</span>
                <span className="mono">{money(data.grossProfit)}</span>
              </div>
              <Section title="Indirect Income" list={data.indirectIncome} total={data.totals.indirectIncome} />
              <Section title="Indirect Expenses" list={data.indirectExpense} total={data.totals.indirectExpense} />
            </div>
            <div className="pl-net">
              <small>Net Profit / (Loss)</small>
              <strong className={data.netProfit >= 0 ? 'text-good' : 'text-bad'}>{money(data.netProfit)}</strong>
              <p className="muted small">
                Gross profit = Direct income − direct expense. Net profit = gross profit + indirect income − indirect expense.
              </p>
              <div className="pl-mini">
                <div><small>Direct income</small><strong className="mono">{money(data.totals.directIncome)}</strong></div>
                <div><small>Direct expense</small><strong className="mono">{money(data.totals.directExpense)}</strong></div>
                <div><small>Indirect income</small><strong className="mono">{money(data.totals.indirectIncome)}</strong></div>
                <div><small>Indirect expense</small><strong className="mono">{money(data.totals.indirectExpense)}</strong></div>
              </div>
            </div>
          </div>
        )}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BalanceSheet() {
  const { companyId } = useAuth();
  const [asOn, setAsOn] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/balance-sheet?as_on=${asOn}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Balance Sheet · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCSV = () => {
    const rows = [['Side', 'Particulars', 'Amount']];
    for (const a of data?.assets || []) rows.push(['Assets', a.name, a.amount]);
    for (const l of data?.liabilities || []) rows.push(['Liabilities', l.name, l.amount]);
    rows.push(['Assets', 'TOTAL', data?.totalAssets]);
    rows.push(['Liabilities', 'TOTAL', data?.totalLiabilities]);
    downloadCSV(`balance_sheet_${asOn}.csv`, rows);
  };

  const Side = ({ title, list, total, tone }) => (
    <div className="bs-side">
      <div className="bs-head"><strong>{title}</strong></div>
      {(list || []).map(r => (
        <div className="bs-row" key={`${r.id}-${r.name}`}>
          <span>{r.name}<div className="row-hint">{r.group_name}</div></span>
          <span className="mono">{money(r.amount)}</span>
        </div>
      ))}
      {!(list || []).length && <div className="bs-row muted"><span>Koi balance nahi</span><span /></div>}
      <div className={`bs-total ${tone}`}><span>Total</span><span className="mono">{money(total)}</span></div>
    </div>
  );

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="As on"><TextInput type="date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Assets <strong className="mono">{money(data.totalAssets)}</strong></span>
            <span>Liabilities <strong className="mono">{money(data.totalLiabilities)}</strong></span>
            <span className={Math.abs(data.difference) < 0.01 ? 'tag tag-good' : 'tag tag-bad'}>
              {Math.abs(data.difference) < 0.01 ? 'Balanced ✓' : `Difference ${money(data.difference)}`}
            </span>
            <span className="muted">Net profit {money(data.netProfit)}</span>
          </div>
        )}
      </Card>

      <ReportShell title="Balance Sheet" subtitle={`As on ${fmtDate(asOn)}`} loading={loading} error={error} onRetry={load}>
        {data && (
          <div className="bs-grid">
            <Side title="Liabilities & Equity" list={data.liabilities} total={data.totalLiabilities} tone="liability" />
            <Side title="Assets" list={data.assets} total={data.totalAssets} tone="asset" />
          </div>
        )}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StockSummary() {
  const { companyId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');

  const load = async (m = method) => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/stock-summary${m ? `?method=${m}` : ''}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    document.title = 'Stock Summary · BahiBooks';
    load(); /* eslint-disable-next-line */
  }, [companyId]);

  useEffect(() => { if (data?.method) setMethod(data.method); /* eslint-disable-next-line */ }, [data?.method]);

  const items = (data?.items || []).filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.hsn || '').includes(search));

  const exportCSV = () => {
    const rows = [['Item', 'Group', 'Unit', 'HSN', 'GST %', 'Opening qty', 'Inward', 'Outward', 'Closing qty', 'Rate', 'Value', 'Method']];
    for (const i of items) rows.push([i.name, i.group_name, i.unit, i.hsn, i.gst_rate, i.opening_qty, i.in_qty, i.out_qty, i.closing_qty, i.rate ?? i.avg_rate, i.value, i.valuation]);
    downloadCSV(`stock_summary_${data?.method || 'AVERAGE'}.csv`, rows);
  };

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="Valuation">
            <SelectInput value={method} onChange={e => { setMethod(e.target.value); load(e.target.value); }}>
              <option value="AVERAGE">Average Cost</option>
              <option value="FIFO">FIFO (First In First Out)</option>
              <option value="LPP">LPP (Last Purchase Price)</option>
            </SelectInput>
          </Field>
          <Field label="Search" className="grow"><TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Item ya HSN..." /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={() => load()}>Refresh</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span><strong>{data.items?.length || 0}</strong> items</span>
            <span>Method <strong>{data.method}</strong></span>
            <span>Total value <strong className="mono">{money(data.totalValue)}</strong></span>
            <span>Total qty <strong className="mono">{data.totalQty}</strong></span>
            <span className={data.lowStock?.length ? 'tag tag-warn' : 'tag tag-good'}>{data.lowStock?.length || 0} low stock</span>
          </div>
        )}
      </Card>

      <ReportShell title="Stock Summary" subtitle={`${method || data?.method || 'AVERAGE'} cost valuation`} loading={loading} error={error} onRetry={load}>
        {items.length ? (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th><th>HSN</th><th className="text-right">GST</th>
                  <th className="text-right">Opening</th><th className="text-right">Inward</th><th className="text-right">Outward</th>
                  <th className="text-right">Closing</th><th className="text-right">Rate</th><th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className={i.low_stock ? 'low-stock-row' : ''}>
                    <td><div className="cell-strong">{i.name}</div><div className="row-hint">{i.group_name || '—'} · {i.unit || '—'}</div></td>
                    <td className="mono">{i.hsn || '—'}</td>
                    <td className="text-right">{i.gst_rate}%</td>
                    <td className="text-right mono">{i.opening_qty}</td>
                    <td className="text-right mono">{i.in_qty}</td>
                    <td className="text-right mono">{i.out_qty}</td>
                    <td className="text-right mono cell-strong">{i.closing_qty}</td>
                    <td className="text-right mono">{money(i.rate ?? i.avg_rate)}</td>
                    <td className="text-right mono cell-strong">{money(i.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={8}>Total stock value</td>
                  <td className="text-right mono">{money(data?.totalValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty title="Koi item nahi mila" icon="box" />}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CashFlow() {
  const { companyId } = useAuth();
  const [range, setRange] = useState({ from: fyStartISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/cash-flow?from=${range.from}&to=${range.to}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Cash Flow · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCSV = () => {
    const rows = [['Section', 'Category', 'Amount', 'Entries']];
    rows.push(['Opening', 'Cash', data?.opening?.cash, '']);
    rows.push(['Opening', 'Bank', data?.opening?.bank, '']);
    for (const r of data?.inflow || []) rows.push(['Inflow', r.category, r.amount, r.count]);
    for (const r of data?.outflow || []) rows.push(['Outflow', r.category, r.amount, r.count]);
    rows.push(['', 'Total inflow', data?.totalIn, '']);
    rows.push(['', 'Total outflow', data?.totalOut, '']);
    rows.push(['', 'Net change', data?.netChange, '']);
    rows.push(['Closing', 'Cash', data?.closing?.cash, '']);
    rows.push(['Closing', 'Bank', data?.closing?.bank, '']);
    downloadCSV(`cash_flow_${range.from}_${range.to}.csv`, rows);
  };

  const FlowTable = ({ title, rows: list, total, tone }) => (
    <Card title={title} subtitle={tone === 'in' ? 'Paise andar aaye (receipts)' : 'Paise bahar gaye (payments)'} flush>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>Category</th><th className="text-right">Entries</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {(list || []).map(r => (
              <tr key={`${r.category}-${r.entry_type}`}>
                <td>{r.category}</td>
                <td className="text-right mono">{r.count}</td>
                <td className="text-right mono">{money(r.amount)}</td>
              </tr>
            ))}
            {!(list || []).length && <tr><td colSpan={3} className="muted">Koi movement nahi</td></tr>}
            <tr className="total-row">
              <td colSpan={2}>{tone === 'in' ? 'Total inflow' : 'Total outflow'}</td>
              <td className="text-right mono">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="From"><TextInput type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Opening <strong className="mono">{money(data.opening?.total)}</strong></span>
            <span>Inflow <strong className="mono text-good">{money(data.totalIn)}</strong></span>
            <span>Outflow <strong className="mono text-bad">{money(data.totalOut)}</strong></span>
            <span className={data.netChange >= 0 ? 'tag tag-good' : 'tag tag-bad'}>Net {money(data.netChange)}</span>
            <span>Closing <strong className="mono">{money(data.closing?.total)}</strong></span>
          </div>
        )}
      </Card>

      <Card title="Opening balance" subtitle={`As on ${fmtDate(range.from)}`}>
        <div className="pl-mini">
          <div><small>Cash in hand</small><strong className="mono">{money(data?.opening?.cash)}</strong></div>
          <div><small>Bank</small><strong className="mono">{money(data?.opening?.bank)}</strong></div>
          <div><small>Total</small><strong className="mono">{money(data?.opening?.total)}</strong></div>
        </div>
      </Card>

      {error ? <ErrorBox error={error} onRetry={load} /> : loading ? <Loading label="Cash flow calculate ho raha hai..." /> : (
        <div className="bs-grid">
          <FlowTable title="Inflow" rows={data?.inflow} total={data?.totalIn} tone="in" />
          <FlowTable title="Outflow" rows={data?.outflow} total={data?.totalOut} tone="out" />
        </div>
      )}

      <Card title="Closing balance" subtitle={`As on ${fmtDate(range.to)}`}>
        <div className="pl-mini">
          <div><small>Cash in hand</small><strong className="mono">{money(data?.closing?.cash)}</strong></div>
          <div><small>Bank</small><strong className="mono">{money(data?.closing?.bank)}</strong></div>
          <div><small>Total</small><strong className="mono">{money(data?.closing?.total)}</strong></div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FundsFlow() {
  const { companyId } = useAuth();
  const [range, setRange] = useState({ from: fyStartISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/funds-flow?from=${range.from}&to=${range.to}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Funds Flow · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportCSV = () => {
    const rows = [['Section', 'Particulars', 'Group', 'Amount']];
    for (const r of data?.sources || []) rows.push(['Sources', r.name, r.group_name, r.change]);
    for (const r of data?.applications || []) rows.push(['Applications', r.name, r.group_name, r.change]);
    rows.push(['', 'Total sources', '', data?.totalSources]);
    rows.push(['', 'Total applications', '', data?.totalApplications]);
    downloadCSV(`funds_flow_${range.from}_${range.to}.csv`, rows);
  };

  const Side = ({ title, list, total, tone }) => (
    <div className="bs-side">
      <div className="bs-head"><strong>{title}</strong></div>
      {(list || []).map(r => (
        <div className="bs-row" key={`${r.id}-${r.name}`}>
          <span>{r.name}<div className="row-hint">{r.group_name}</div></span>
          <span className="mono">{money(r.change)}</span>
        </div>
      ))}
      {!(list || []).length && <div className="bs-row muted"><span>Koi movement nahi</span><span /></div>}
      <div className={`bs-total ${tone}`}><span>Total</span><span className="mono">{money(total)}</span></div>
    </div>
  );

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="From"><TextInput type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Sources <strong className="mono text-good">{money(data.totalSources)}</strong></span>
            <span>Applications <strong className="mono text-bad">{money(data.totalApplications)}</strong></span>
            <span>Net profit <strong className="mono">{money(data.netProfit)}</strong></span>
            <span>Cash change <strong className="mono">{money(data.cashChange)}</strong></span>
          </div>
        )}
      </Card>

      <ReportShell title="Funds Flow Statement" subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`} loading={loading} error={error} onRetry={load}>
        {data && (
          <div className="bs-grid">
            <Side title="Sources of Funds" list={data.sources} total={data.totalSources} tone="asset" />
            <Side title="Applications of Funds" list={data.applications} total={data.totalApplications} tone="liability" />
          </div>
        )}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BillWise() {
  const { companyId } = useAuth();
  const [type, setType] = useState('receivable');
  const [asOn, setAsOn] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/bill-wise?type=${type}&as_on=${asOn}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Bill-wise Outstanding · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId, type, asOn]);

  const exportCSV = () => {
    const rows = [['Party', 'GSTIN', 'Bill No', 'Bill Date', 'Due Date', 'Bill Amount', 'Settled', 'Pending', 'Overdue days']];
    for (const p of data?.parties || []) {
      for (const b of p.bills || []) rows.push([p.name, p.gstin, b.number, b.date, b.due_date, b.total, b.settled, b.pending, b.overdue_days]);
      if (p.on_account) rows.push([p.name, p.gstin, 'On account', '', '', '', '', p.on_account, '']);
    }
    downloadCSV(`bill_wise_${type}_${asOn}.csv`, rows);
  };

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="Type">
            <SelectInput value={type} onChange={e => setType(e.target.value)}>
              <option value="receivable">Receivable (Customers)</option>
              <option value="payable">Payable (Suppliers)</option>
            </SelectInput>
          </Field>
          <Field label="As on"><TextInput type="date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span><strong>{data.parties?.length || 0}</strong> parties</span>
            <span>Total pending <strong className="mono">{money(data.totalPending)}</strong></span>
            <span className={data.parties?.some(p => p.overdue > 0) ? 'tag tag-bad' : 'tag tag-good'}>
              {money(data.parties?.reduce((s, p) => s + (p.overdue || 0), 0))} overdue
            </span>
          </div>
        )}
      </Card>

      <ReportShell title={type === 'payable' ? 'Payable Outstanding' : 'Receivable Outstanding'} subtitle={`As on ${fmtDate(asOn)}`} loading={loading} error={error} onRetry={load}>
        {data?.parties?.length ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Party</th><th className="text-right">Total</th><th className="text-right">Overdue</th><th className="text-right">Bills</th></tr></thead>
              <tbody>
                {data.parties.map(p => {
                  const isOpen = open[p.id] !== false;
                  return (
                    <Fragment key={p.id}>
                      <tr className="group-row" onClick={() => setOpen({ ...open, [p.id]: !isOpen })}>
                        <td><span className="tree-caret">{isOpen ? '▾' : '▸'}</span><strong>{p.name}</strong>{p.gstin ? <div className="row-hint">{p.gstin}</div> : null}</td>
                        <td className="text-right mono cell-strong">{money(p.total)}</td>
                        <td className={`text-right mono ${p.overdue > 0 ? 'text-bad' : ''}`}>{p.overdue ? money(p.overdue) : '—'}</td>
                        <td className="text-right mono">{(p.bills || []).length}</td>
                      </tr>
                      {isOpen && (p.bills || []).map(b => (
                        <tr key={`b-${b.id}`} className={b.overdue ? 'low-stock-row' : ''}>
                          <td style={{ paddingLeft: 34 }}>
                            <span className="mono">{b.number}</span>
                            <div className="row-hint">{fmtDate(b.date)}{b.due_date ? ` · due ${fmtDate(b.due_date)}` : ''}{b.overdue ? ` · ${b.overdue_days}d overdue` : ''}</div>
                          </td>
                          <td className="text-right mono">{money(b.pending)}<div className="row-hint">of {money(b.total)}</div></td>
                          <td className="text-right mono">{b.overdue ? money(b.pending) : '—'}</td>
                          <td />
                        </tr>
                      ))}
                      {isOpen && p.on_account > 0 && (
                        <tr>
                          <td style={{ paddingLeft: 34 }}>On account<div className="row-hint">Advance / unallocated</div></td>
                          <td className="text-right mono">{money(p.on_account)}</td>
                          <td /><td />
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="total-row">
                  <td colSpan={1}>Grand total pending</td>
                  <td className="text-right mono">{money(data.totalPending)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty title="Koi outstanding nahi" icon="check" />}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ExpiryAlerts() {
  const { companyId } = useAuth();
  const [asOn, setAsOn] = useState(todayISO());
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await api(`/reports/expiry-alerts?as_on=${asOn}&days=${days}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Expiry Alerts · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId, asOn, days]);

  const exportCSV = () => {
    const rows = [['Item', 'Batch', 'Expiry', 'Days left', 'Status', 'Qty', 'Rate', 'Value']];
    for (const i of data?.items || []) rows.push([i.item_name, i.batch_no, i.expiry_date, i.days_left, i.status, i.qty, i.rate, i.value]);
    downloadCSV(`expiry_alerts_${asOn}.csv`, rows);
  };

  const statusTag = (s) => (s === 'EXPIRED' ? 'tag tag-bad' : s === 'NEAR_EXPIRY' ? 'tag tag-warn' : 'tag tag-good');
  const statusLabel = (s) => (s === 'EXPIRED' ? 'Expired' : s === 'NEAR_EXPIRY' ? 'Near expiry' : 'OK');

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="As on"><TextInput type="date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
          <Field label="Alert days">
            <SelectInput value={days} onChange={e => setDays(Number(e.target.value))}>
              {[7, 15, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
            </SelectInput>
          </Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span><strong>{data.items?.length || 0}</strong> batches</span>
            <span className="tag tag-bad">{data.expired?.length || 0} expired</span>
            <span className="tag tag-warn">{data.nearExpiry?.length || 0} near expiry</span>
            <span>Expired value <strong className="mono">{money(data.expiredValue)}</strong></span>
          </div>
        )}
      </Card>

      <ReportShell title="Expiry Alerts" subtitle={`Batch-wise stock · as on ${fmtDate(asOn)}`} loading={loading} error={error} onRetry={load}>
        {data?.items?.length ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th className="text-right">Days left</th><th>Status</th><th className="text-right">Qty</th><th className="text-right">Value</th></tr></thead>
              <tbody>
                {data.items.map((i, idx) => (
                  <tr key={`${i.stock_item_id}-${i.batch_no}-${idx}`}>
                    <td><div className="cell-strong">{i.item_name}</div><div className="row-hint">{i.unit || '—'}</div></td>
                    <td className="mono">{i.batch_no}</td>
                    <td>{fmtDate(i.expiry_date)}</td>
                    <td className="text-right mono">{i.days_left}</td>
                    <td><span className={statusTag(i.status)}>{statusLabel(i.status)}</span></td>
                    <td className="text-right mono">{i.qty}</td>
                    <td className="text-right mono cell-strong">{money(i.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="Koi expiry-batch nahi mila" icon="box" />}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LedgerBook() {
  const { companyId } = useAuth();
  const [ledgers, setLedgers] = useState([]);
  const [ledgerId, setLedgerId] = useState('');
  const [range, setRange] = useState({ from: fyStartISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLedgers = async () => {
    try {
      const boot = await api('/masters/bootstrap');
      setLedgers(boot.ledgers || []);
      if (!ledgerId && boot.ledgers?.length) {
        const preferred = boot.ledgers.find(l => /Sundry Debtors/i.test(l.group_name)) || boot.ledgers[0];
        setLedgerId(String(preferred.id));
      }
    } catch (err) { setError(err); }
  };

  const load = async (id = ledgerId) => {
    if (!id) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await api(`/reports/ledger?ledger_id=${id}&from=${range.from}&to=${range.to}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Ledger Book · BahiBooks'; loadLedgers(); /* eslint-disable-next-line */ }, [companyId]);
  useEffect(() => { if (ledgerId) load(ledgerId); /* eslint-disable-next-line */ }, [ledgerId, range.from, range.to]);

  const exportCSV = () => {
    const rows = [['Date', 'Voucher', 'Type', 'Particulars', 'Debit', 'Credit', 'Balance']];
    rows.push(['', '', '', 'Opening Balance', data?.opening?.type === 'Dr' ? data.opening.amount : '', data?.opening?.type === 'Cr' ? data.opening.amount : '', '']);
    for (const l of data?.lines || []) rows.push([l.date, l.number, l.type, l.account_name || l.narration, l.dr, l.cr, `${l.balance} ${l.balanceType}`]);
    rows.push(['', '', '', 'Closing Balance', '', '', `${data?.closing?.amount} ${data?.closing?.type}`]);
    downloadCSV(`ledger_${ledgerId}_${range.from}_${range.to}.csv`, rows);
  };

  const ledger = data?.ledger;

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="Ledger" className="grow">
            <SelectInput value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
              <option value="">Select ledger</option>
              {ledgers.map(l => <option key={l.id} value={l.id}>{l.name} — {l.group_name}</option>)}
            </SelectInput>
          </Field>
          <Field label="From"><TextInput type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={() => load()}>Apply</Button>
            <Button icon="download" onClick={exportCSV} disabled={!data}>CSV</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Group <strong>{ledger?.group_name || '—'}</strong></span>
            <span>Opening <strong className="mono">{money(data.opening?.amount)} {data.opening?.type}</strong></span>
            <span>Closing <strong className="mono">{money(data.closing?.amount)} {data.closing?.type}</strong></span>
          </div>
        )}
      </Card>

      <ReportShell title={ledger ? ledger.name : 'Ledger Book'} subtitle={ledger ? `${ledger.group_name} · ${fmtDate(range.from)} – ${fmtDate(range.to)}` : 'Ledger select karo'} loading={loading} error={error} onRetry={() => load()}>
        {data ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                <tr className="opening-row">
                  <td colSpan={4}><strong>Opening Balance</strong></td>
                  <td className="text-right mono">{data.opening.type === 'Dr' ? money(data.opening.amount) : '—'}</td>
                  <td className="text-right mono">{data.opening.type === 'Cr' ? money(data.opening.amount) : '—'}</td>
                  <td className="text-right mono">{money(data.opening.amount)} {data.opening.type}</td>
                </tr>
                {(data.lines || []).map((l, i) => (
                  <tr key={`${l.voucher_id}-${i}`}>
                    <td>{fmtDate(l.date)}</td>
                    <td className="mono">{l.number}</td>
                    <td><span className="tag">{l.type}</span></td>
                    <td>{l.account_name || l.narration || '—'}</td>
                    <td className="text-right mono">{l.dr ? money(l.dr) : '—'}</td>
                    <td className="text-right mono">{l.cr ? money(l.cr) : '—'}</td>
                    <td className="text-right mono">{money(l.balance)} {l.balanceType}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={4}>Closing Balance</td>
                  <td className="text-right mono">{money(data.totals.dr)}</td>
                  <td className="text-right mono">{money(data.totals.cr)}</td>
                  <td className="text-right mono">{money(data.closing.amount)} {data.closing.type}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty title="Ledger select karo" icon="book" />}
      </ReportShell>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BRS() {
  const { companyId } = useAuth();
  const toast = useToast();
  const [banks, setBanks] = useState([]);
  const [ledgerId, setLedgerId] = useState('');
  const [asOn, setAsOn] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadBanks = async () => {
    try {
      const res = await api('/reports/brs/banks');
      setBanks(res.banks || []);
      if (!ledgerId && res.banks?.[0]) setLedgerId(String(res.banks[0].id));
    } catch (err) { setError(err); }
  };

  const load = async (id = ledgerId) => {
    if (!id) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setData(await api(`/reports/brs?ledger_id=${id}&as_on=${asOn}`)); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'Bank Reconciliation · BahiBooks'; loadBanks(); /* eslint-disable-next-line */ }, [companyId]);
  useEffect(() => { if (ledgerId) load(ledgerId); /* eslint-disable-next-line */ }, [ledgerId, asOn]);

  const toggle = async (line, reconciled) => {
    setBusy(true);
    try {
      await api(`/vouchers/${line.voucher_id}/reconcile`, {
        method: 'POST',
        body: { ledger_id: Number(ledgerId), reconciled, bank_date: reconciled ? todayISO() : '' },
      });
      toast.success(reconciled ? 'Entry cleared' : 'Entry uncleared');
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <Card>
        <div className="filter-bar">
          <Field label="Bank ledger" className="grow">
            <SelectInput value={ledgerId} onChange={e => setLedgerId(e.target.value)}>
              <option value="">Select bank</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name} — {b.account_no || b.bank_name || ''}</option>)}
            </SelectInput>
          </Field>
          <Field label="As on"><TextInput type="date" value={asOn} onChange={e => setAsOn(e.target.value)} /></Field>
          <div className="filter-actions"><Button icon="refresh" onClick={() => load()}>Apply</Button></div>
        </div>
        {data && (
          <div className="filter-stats">
            <span>Book balance <strong className="mono">{money(data.bookBalance)}</strong></span>
            <span>Reconciled <strong className="mono">{money(data.reconciledBalance)}</strong></span>
            <span className={data.unclearedCount ? 'tag tag-warn' : 'tag tag-good'}>{data.unclearedCount} uncleared</span>
          </div>
        )}
      </Card>

      <ReportShell title={data?.ledger?.name || 'Bank Reconciliation'} subtitle={`As on ${fmtDate(asOn)} · tick karke clear karo`} loading={loading} error={error} onRetry={() => load()}>
        {data ? (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Cleared</th><th>Date</th><th>Voucher</th><th>Type</th><th>Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
              <tbody>
                <tr className="opening-row">
                  <td colSpan={5}><strong>Opening balance</strong></td>
                  <td className="text-right mono">{data.opening >= 0 ? money(data.opening) : '—'}</td>
                  <td className="text-right mono">{data.opening < 0 ? money(Math.abs(data.opening)) : '—'}</td>
                </tr>
                {(data.lines || []).map((l, i) => (
                  <tr key={`${l.voucher_id}-${i}`} className={l.reconciled ? 'reconciled-row' : ''}>
                    <td>
                      <input type="checkbox" checked={!!l.reconciled} disabled={busy} onChange={e => toggle(l, e.target.checked)} />
                    </td>
                    <td>{fmtDate(l.date)}</td>
                    <td className="mono">{l.number}</td>
                    <td><span className="tag">{l.type}</span></td>
                    <td>{l.narration || '—'}</td>
                    <td className="text-right mono">{l.dr ? money(l.dr) : '—'}</td>
                    <td className="text-right mono">{l.cr ? money(l.cr) : '—'}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={5}>Book balance</td>
                  <td className="text-right mono">{money(data.totals.dr)}</td>
                  <td className="text-right mono">{money(data.totals.cr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <Empty title="Bank ledger select karo" icon="bank" />}
      </ReportShell>
    </div>
  );
}
