import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, downloadFile } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, PageHeader, Stat, TextInput,
} from '../components/ui.jsx';
import { downloadJSON, fmtDate, money, monthStartISO, todayISO } from '../utils.js';

const TABS = [
  { key: 'summary', label: 'GSTR-3B Summary' },
  { key: 'b2b', label: 'GSTR-1 · B2B' },
  { key: 'b2c', label: 'GSTR-1 · B2C' },
  { key: 'hsn', label: 'HSN Summary' },
  { key: 'notes', label: 'Credit Notes' },
];

export default function GST() {
  const { companyId, companies } = useAuth();
  const toast = useToast();
  const company = companies.find(c => c.id === companyId);
  const [range, setRange] = useState({ from: monthStartISO(), to: todayISO() });
  const [summary, setSummary] = useState(null);
  const [gstr1, setGstr1] = useState(null);
  const [tab, setTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [s, g] = await Promise.all([
        api(`/reports/gst-summary?from=${range.from}&to=${range.to}`),
        api(`/reports/gstr1?from=${range.from}&to=${range.to}`),
      ]);
      setSummary(s);
      setGstr1(g);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { document.title = 'GST Center · BahiBooks'; load(); /* eslint-disable-next-line */ }, [companyId]);

  const exportGSTR1 = async () => {
    setBusy(true);
    try {
      await downloadFile(`/reports/gstr1/export?from=${range.from}&to=${range.to}`, `GSTR1_${range.from}_${range.to}.json`);
      toast.success('GSTR-1 JSON download ho gaya');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const exportSummary = () => {
    const s = summary;
    downloadJSON(`GST_summary_${range.from}_${range.to}.json`, {
      company: company?.name, gstin: company?.gstin, period: s.period,
      outward: s.outward, itc: s.itc, netTax: s.netTax, payable: s.cashPayable, excessItc: s.excessItc,
    });
  };

  if (loading) return <Loading label="GST data calculate ho raha hai..." />;
  if (error) return <ErrorBox error={error} onRetry={load} />;

  const s = summary || {};
  const g = gstr1 || {};

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="GST & Compliance"
        title="GST Center"
        subtitle={`${company?.name || ''} · GSTIN ${company?.gstin || 'NOT SET'} · ${company?.state || ''}`}
        actions={(
          <>
            <Button icon="refresh" onClick={load}>Refresh</Button>
            <Button icon="download" onClick={exportSummary}>3B JSON</Button>
            <Button variant="primary" icon="download" onClick={exportGSTR1} disabled={busy}>{busy ? 'Exporting...' : 'GSTR-1 JSON'}</Button>
          </>
        )}
      />

      {!company?.gstin && (
        <div className="info-panel warn"><Icon name="alert" /><p>Company GSTIN set nahi hai. Settings me GSTIN daalo, tabhi invoice aur returns sahi lenge.</p></div>
      )}

      <Card>
        <div className="filter-bar">
          <Field label="From"><TextInput type="date" value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
          <div className="filter-actions">
            <Button icon="refresh" onClick={load}>Apply period</Button>
            <Button icon="print" onClick={() => window.print()}>Print</Button>
          </div>
        </div>
        <div className="filter-stats">
          <span>Outward invoices <strong>{s.outward?.invoices || 0}</strong></span>
          <span>Inward (ITC) <strong>{s.itc?.invoices || 0}</strong></span>
          <span className={s.payable ? 'tag tag-warn' : 'tag tag-good'}>
            {s.payable ? `Net payable ${money(s.cashPayable)}` : `Excess ITC ${money(s.excessItc)}`}
          </span>
        </div>
      </Card>

      <div className="grid grid-4">
        <Stat label="Taxable outward" value={money(s.outward?.taxable)} foot={`${s.outward?.invoices || 0} invoices`} icon="trend" />
        <Stat label="Output tax" value={money(s.outward?.total)} foot={`CGST ${money(s.outward?.cgst)} · SGST ${money(s.outward?.sgst)} · IGST ${money(s.outward?.igst)}`} icon="percent" />
        <Stat label="Input tax credit" value={money(s.itc?.total)} foot={`CGST ${money(s.itc?.cgst)} · SGST ${money(s.itc?.sgst)} · IGST ${money(s.itc?.igst)}`} icon="download" tone="good" />
        <Stat
          label={s.payable ? 'Net GST payable' : 'Excess ITC'}
          value={money(s.payable ? s.cashPayable : s.excessItc)}
          foot={s.payable ? 'Challan bharo' : 'Carry forward'}
          icon="banknote"
          tone={s.payable ? 'warn' : 'good'}
        />
      </div>

      <div className="master-tabs">
        {TABS.map(t => (
          <button key={t.key} type="button" className={`master-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' && (
        <div className="grid grid-2">
          <Card title="GSTR-3B working" subtitle="Outward minus credit notes, ITC minus debit notes">
            <div className="gst-table">
              <div className="gst-row head"><span>Particulars</span><span>Taxable</span><span>CGST</span><span>SGST</span><span>IGST</span></div>
              <div className="gst-row"><span>Outward supplies</span><span>{money(s.outward?.taxable)}</span><span>{money(s.outward?.cgst)}</span><span>{money(s.outward?.sgst)}</span><span>{money(s.outward?.igst)}</span></div>
              <div className="gst-row"><span>Less: Credit notes</span><span>{money(s.creditNotes?.taxable)}</span><span>{money(s.creditNotes?.cgst)}</span><span>{money(s.creditNotes?.sgst)}</span><span>{money(s.creditNotes?.igst)}</span></div>
              <div className="gst-row strong"><span>Net outward</span><span>{money(s.outward?.taxable)}</span><span>{money(s.outward?.cgst)}</span><span>{money(s.outward?.sgst)}</span><span>{money(s.outward?.igst)}</span></div>
              <div className="gst-row"><span>ITC on purchases</span><span>{money(s.itc?.taxable)}</span><span>{money(s.itc?.cgst)}</span><span>{money(s.itc?.sgst)}</span><span>{money(s.itc?.igst)}</span></div>
              <div className="gst-row strong total"><span>Net tax payable</span><span>—</span><span>{money((s.outward?.cgst || 0) - (s.itc?.cgst || 0))}</span><span>{money((s.outward?.sgst || 0) - (s.itc?.sgst || 0))}</span><span>{money((s.outward?.igst || 0) - (s.itc?.igst || 0))}</span></div>
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>
              Ye estimate working hai. Final GSTR-3B filing se pehle CA se verify karo — place of supply, RCM aur exempt supplies isme manually adjust hote hain.
            </p>
          </Card>

          <Card title="Period totals" subtitle={`${fmtDate(range.from)} – ${fmtDate(range.to)}`}>
            <div className="summary-line"><span>Total sales invoices</span><span>{g.totals?.invoiceCount || 0}</span></div>
            <div className="summary-line"><span>B2B invoices</span><span>{g.b2b?.length || 0}</span></div>
            <div className="summary-line"><span>B2C invoices</span><span>{g.b2c?.length || 0}</span></div>
            <div className="summary-line"><span>Credit notes</span><span>{g.creditNotes?.length || 0}</span></div>
            <div className="summary-sep" />
            <div className="summary-line"><span>Taxable total</span><span className="mono">{money(g.totals?.taxable)}</span></div>
            <div className="summary-line"><span>CGST</span><span className="mono">{money(g.totals?.cgst)}</span></div>
            <div className="summary-line"><span>SGST</span><span className="mono">{money(g.totals?.sgst)}</span></div>
            <div className="summary-line"><span>IGST</span><span className="mono">{money(g.totals?.igst)}</span></div>
            <div className="summary-total"><span>Invoice value</span><span className="mono">{money((g.totals?.taxable || 0) + (g.totals?.cgst || 0) + (g.totals?.sgst || 0) + (g.totals?.igst || 0))}</span></div>
          </Card>
        </div>
      )}

      {tab === 'b2b' && (
        <Card title="B2B invoices" subtitle="GSTIN wale customers ki sales" flush>
          {g.b2b?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>GSTIN</th><th>POS</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {g.b2b.map((v, i) => (
                    <tr key={i}>
                      <td className="mono">{v.number}</td>
                      <td>{fmtDate(v.date)}</td>
                      <td>{v.party_name}</td>
                      <td className="mono">{v.gstin}</td>
                      <td>{v.place_of_supply || v.state || '—'}</td>
                      <td className="text-right mono">{money(v.taxable)}</td>
                      <td className="text-right mono">{money(v.cgst)}</td>
                      <td className="text-right mono">{money(v.sgst)}</td>
                      <td className="text-right mono">{money(v.igst)}</td>
                      <td className="text-right mono">{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Is period me B2B invoice nahi" subtitle="Customer ke ledger me GSTIN daalo, tab B2B me aayega." icon="percent" />}
        </Card>
      )}

      {tab === 'b2c' && (
        <Card title="B2C invoices" subtitle="GSTIN ke bina wali sales" flush>
          {g.b2c?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Invoice</th><th>Date</th><th>POS</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {g.b2c.map((v, i) => (
                    <tr key={i}>
                      <td className="mono">{v.number}</td>
                      <td>{fmtDate(v.date)}</td>
                      <td>{v.place_of_supply || '—'}</td>
                      <td className="text-right mono">{money(v.taxable)}</td>
                      <td className="text-right mono">{money(v.cgst)}</td>
                      <td className="text-right mono">{money(v.sgst)}</td>
                      <td className="text-right mono">{money(v.igst)}</td>
                      <td className="text-right mono">{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Koi B2C invoice nahi" icon="percent" />}
        </Card>
      )}

      {tab === 'hsn' && (
        <Card title="HSN summary" subtitle="Item-wise qty, taxable value aur tax" flush>
          {g.hsn?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>HSN</th><th>Item</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th></tr></thead>
                <tbody>
                  {g.hsn.map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{h.hsn || 'NA'}</td>
                      <td>{h.item_name}</td>
                      <td>{h.unit || '—'}</td>
                      <td className="text-right mono">{h.qty}</td>
                      <td className="text-right">{h.gst_rate}%</td>
                      <td className="text-right mono">{money(h.taxable)}</td>
                      <td className="text-right mono">{money(h.cgst)}</td>
                      <td className="text-right mono">{money(h.sgst)}</td>
                      <td className="text-right mono">{money(h.igst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="HSN data nahi" icon="file" />}
        </Card>
      )}

      {tab === 'notes' && (
        <Card title="Credit notes" subtitle="Sales returns — GSTR-1 me adjust hote hain" flush>
          {g.creditNotes?.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Note</th><th>Date</th><th>Party</th><th>GSTIN</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  {g.creditNotes.map((v, i) => (
                    <tr key={i}>
                      <td className="mono">{v.number}</td>
                      <td>{fmtDate(v.date)}</td>
                      <td>{v.party_name || '—'}</td>
                      <td className="mono">{v.gstin || '—'}</td>
                      <td className="text-right mono">{money(v.taxable)}</td>
                      <td className="text-right mono">{money(v.cgst)}</td>
                      <td className="text-right mono">{money(v.sgst)}</td>
                      <td className="text-right mono">{money(v.igst)}</td>
                      <td className="text-right mono">{money(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Koi credit note nahi" icon="file" />}
        </Card>
      )}

      <Card title="Compliance notes" subtitle="Yaad rakho">
        <div className="info-stack">
          <div><Icon name="alert" size={15} /><span><strong>GSTR-1:</strong> B2B invoices GSTIN ke saath, B2C chhoti invoices summary me, B2C Large (₹2.5 lakh+) alag section me.</span></div>
          <div><Icon name="alert" size={15} /><span><strong>GSTR-3B:</strong> Output tax − ITC = net payable. Reverse charge, exempt aur nil-rated supplies manually add karni padti hain.</span></div>
          <div><Icon name="alert" size={15} /><span><strong>E-invoice / e-way bill:</strong> GSTN/IRP integration v1 me nahi hai. Portal par manually generate karo — JSON export madad karega.</span></div>
          <div><Icon name="alert" size={15} /><span><strong>Filing:</strong> Ye data working hai, final filing se pehle CA/auditor se verify karo.</span></div>
        </div>
      </Card>
    </div>
  );
}
