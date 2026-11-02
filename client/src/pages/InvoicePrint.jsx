import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { Button, Icon, Loading } from '../components/ui.jsx';
import { amountInWords, fmtDate, money, plainMoney, voucherLabel } from '../utils.js';

const TITLES = {
  SALES: 'Tax Invoice',
  PURCHASE: 'Purchase Bill',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  PAYMENT: 'Payment Voucher',
  RECEIPT: 'Receipt Voucher',
  CONTRA: 'Contra Voucher',
  JOURNAL: 'Journal Voucher',
};

export default function InvoicePrint() {
  const { id } = useParams();
  const { user, companies, companyId } = useAuth();
  const company = companies.find(c => c.id === companyId) || {};

  const [voucher, setVoucher] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [v, boot] = await Promise.all([
          api(`/vouchers/${id}`),
          api('/masters/bootstrap').catch(() => ({ ledgers: [] })),
        ]);
        if (!alive) return;
        setVoucher(v.voucher);
        setLedgers(boot.ledgers || []);
        document.title = `${v.voucher?.number || 'Voucher'} · ${company.name || 'BahiBooks'}`;
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    if (user && companyId) load();
    else setLoading(false);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, companyId]);

  const party = useMemo(
    () => ledgers.find(l => Number(l.id) === Number(voucher?.party_ledger_id)),
    [ledgers, voucher],
  );

  if (!user) {
    return (
      <div className="print-screen">
        <div className="print-message">
          <Icon name="lock" size={30} />
          <h2>Invoice dekhne ke liye login karo</h2>
          <p>Session expire ho gaya hai. Dobara sign in karke print kholo.</p>
          <Link to="/login"><Button variant="primary">Go to login</Button></Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="print-screen"><Loading label="Invoice load ho raha hai..." /></div>;
  }

  if (error || !voucher) {
    return (
      <div className="print-screen">
        <div className="print-message">
          <Icon name="alert" size={30} />
          <h2>Voucher nahi mila</h2>
          <p>{error || 'Ho sakta hai voucher delete ho gaya ho ya company select nahi hai.'}</p>
          <Link to="/"><Button icon="dashboard">Dashboard</Button></Link>
        </div>
      </div>
    );
  }

  const isItem = Array.isArray(voucher.items) && voucher.items.length > 0;
  const isInterState = Number(voucher.igst || 0) > 0;
  const title = TITLES[voucher.type] || 'Voucher';
  const supplyState = voucher.place_of_supply || party?.state || company.state || '';
  const totalTax = Number(voucher.cgst || 0) + Number(voucher.sgst || 0) + Number(voucher.igst || 0);

  return (
    <div className="print-screen">
      <div className="print-toolbar">
        <div>
          <strong>{voucher.number}</strong>
          <span className="muted"> · {voucherLabel(voucher.type)} · {fmtDate(voucher.date)}</span>
        </div>
        <div className="header-actions">
          <Link to="/daybook"><Button icon="back">Daybook</Button></Link>
          <Button variant="primary" icon="print" onClick={() => window.print()}>Print / Save PDF</Button>
        </div>
      </div>

      <div className="invoice-sheet">
        <header className="invoice-head">
          <div className="invoice-brand">
            <div className="invoice-logo">B</div>
            <div>
              <h1>{company.name || 'BahiBooks'}</h1>
              {company.address && <p>{company.address}</p>}
              <p>
                {[company.city, company.state, company.pincode].filter(Boolean).join(', ')}
              </p>
              {(company.phone || company.email) && (
                <p>{[company.phone, company.email].filter(Boolean).join(' · ')}</p>
              )}
              {company.gstin && <p className="mono">GSTIN: {company.gstin}</p>}
            </div>
          </div>
          <div className="invoice-title">
            <h2>{title}</h2>
            <table className="invoice-meta">
              <tbody>
                <tr><td>Number</td><td className="mono">{voucher.number}</td></tr>
                <tr><td>Date</td><td>{fmtDate(voucher.date)}</td></tr>
                {voucher.due_date && <tr><td>Due date</td><td>{fmtDate(voucher.due_date)}</td></tr>}
                <tr><td>Place of supply</td><td>{supplyState || '—'}</td></tr>
                <tr><td>Payment</td><td>{voucher.payment_mode || 'Credit'}</td></tr>
                {voucher.eway_bill_no && <tr><td>E-Way bill</td><td className="mono">{voucher.eway_bill_no}</td></tr>}
                {voucher.transport_name && <tr><td>Transport</td><td>{voucher.transport_name}</td></tr>}
                {voucher.vehicle_no && <tr><td>Vehicle no.</td><td className="mono">{voucher.vehicle_no}</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <section className="invoice-parties">
          <div className="invoice-party">
            <span className="eyebrow">Bill to</span>
            <h3>{voucher.party_name || voucher.from_name || voucher.to_name || 'Cash'}</h3>
            {party?.address && <p>{party.address}</p>}
            {(party?.city || party?.state) && <p>{[party.city, party.state].filter(Boolean).join(', ')}</p>}
            {party?.phone && <p>Phone: {party.phone}</p>}
            {party?.gstin && <p className="mono">GSTIN: {party.gstin}</p>}
            {party?.gst_type && <p className="muted">GST: {party.gst_type}</p>}
          </div>
          <div className="invoice-party right">
            <span className="eyebrow">Tax mode</span>
            <h3>{isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</h3>
            <p>{supplyState || '—'} · {company.state || '—'}</p>
            {voucher.narration && <p className="invoice-narration">{voucher.narration}</p>}
          </div>
        </section>

        {voucher.ship_to && (
          <section className="invoice-parties">
            <div className="invoice-party">
              <span className="eyebrow">Ship to</span>
              <p>{voucher.ship_to}</p>
            </div>
          </section>
        )}

        {isItem ? (
          <table className="invoice-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>HSN</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Disc %</th>
                <th className="text-right">GST %</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {voucher.items.map((item, i) => (
                <tr key={item.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{item.item_name}</strong>
                    {item.godown_name && <div className="row-hint">Godown: {item.godown_name}</div>}
                  </td>
                  <td className="mono">{item.hsn || '—'}</td>
                  <td className="text-right mono">{item.qty} {item.unit_symbol || ''}</td>
                  <td className="text-right mono">{plainMoney(item.rate)}</td>
                  <td className="text-right mono">{item.discount_pct || 0}%</td>
                  <td className="text-right mono">{item.gst_rate || 0}%</td>
                  <td className="text-right mono">{money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="invoice-table">
            <thead>
              <tr><th>#</th><th>Particulars</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr>
            </thead>
            <tbody>
              {(voucher.entries || []).map((entry, i) => (
                <tr key={entry.id}>
                  <td>{i + 1}</td>
                  <td>{entry.ledger_name}{entry.narration ? <div className="row-hint">{entry.narration}</div> : null}</td>
                  <td className="text-right mono">{entry.entry_type === 'Dr' ? money(entry.amount) : '—'}</td>
                  <td className="text-right mono">{entry.entry_type === 'Cr' ? money(entry.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className="invoice-summary">
          <div className="invoice-words">
            <span className="eyebrow">Amount in words</span>
            <p>{amountInWords(voucher.total)}</p>
            {voucher.created_by_name && <p className="muted small">Created by {voucher.created_by_name}</p>}
          </div>
          <table className="invoice-totals">
            <tbody>
              <tr><td>Taxable value</td><td className="mono">{money(voucher.taxable)}</td></tr>
              {Number(voucher.discount || 0) > 0 && (
                <tr><td>Discount</td><td className="mono">− {money(voucher.discount)}</td></tr>
              )}
              {isInterState ? (
                <tr><td>IGST</td><td className="mono">{money(voucher.igst)}</td></tr>
              ) : (
                <>
                  <tr><td>CGST</td><td className="mono">{money(voucher.cgst)}</td></tr>
                  <tr><td>SGST</td><td className="mono">{money(voucher.sgst)}</td></tr>
                </>
              )}
              {Number(voucher.cess || 0) > 0 && <tr><td>Cess</td><td className="mono">{money(voucher.cess)}</td></tr>}
              {Number(voucher.roundoff || 0) !== 0 && (
                <tr><td>Round off</td><td className="mono">{money(voucher.roundoff)}</td></tr>
              )}
              <tr className="invoice-grand"><td>Total</td><td className="mono">{money(voucher.total)}</td></tr>
              {totalTax > 0 && <tr className="invoice-tax-note"><td colSpan={2}>Includes GST {money(totalTax)}</td></tr>}
            </tbody>
          </table>
        </section>

        <footer className="invoice-foot">
          <div>
            <span className="eyebrow">Notes</span>
            <p>Goods once sold will not be taken back. Subject to {company.city || company.state || 'local'} jurisdiction.</p>
            <p className="muted small">Computer generated {title.toLowerCase()} · BahiBooks ERP</p>
          </div>
          <div className="invoice-sign">
            <div className="sign-space" />
            <strong>For {company.name || 'BahiBooks'}</strong>
            <span>Authorised signatory</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
