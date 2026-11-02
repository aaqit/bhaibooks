import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, downloadFile } from '../api.js';
import {
  Button, Card, Empty, ErrorBox, Field, Icon, Loading, Modal, PageHeader, SearchInput, SelectInput, TextInput,
} from '../components/ui.jsx';
import {
  VOUCHER_META, downloadCSV, fmtDate, money, monthStartISO, todayISO, voucherLabel, voucherTone,
} from '../utils.js';

const TYPES = ['ALL', ...Object.keys(VOUCHER_META)];

export default function Daybook() {
  const { companyId, hasCap } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ from: monthStartISO(), to: todayISO(), type: 'ALL', q: '' });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: filters.from, to: filters.to, limit: '500' });
      if (filters.type !== 'ALL') params.set('type', filters.type);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      const res = await api(`/vouchers?${params.toString()}`);
      setList(res.vouchers || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Daybook · BahiBooks';
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filters.from, filters.to, filters.type]);

  const summary = useMemo(() => {
    const total = list.reduce((s, v) => s + Number(v.total || 0), 0);
    const byType = {};
    for (const v of list) byType[v.type] = (byType[v.type] || 0) + 1;
    return { total, count: list.length, byType };
  }, [list]);

  const openDetail = async (v) => {
    setDetailLoading(true);
    setDetail({ id: v.id, loading: true });
    try {
      const res = await api(`/vouchers/${v.id}`);
      setDetail(res.voucher);
    } catch (err) {
      toast.error(err.message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await api(`/vouchers/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(res.message || 'Voucher delete ho gaya');
      setDeleteTarget(null);
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    const rows = [['Date', 'Voucher No', 'Type', 'Account', 'Narration', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']];
    for (const v of list) {
      rows.push([v.date, v.number, voucherLabel(v.type), v.account_name || '', v.narration || '', v.taxable, v.cgst, v.sgst, v.igst, v.total]);
    }
    downloadCSV(`daybook_${filters.from}_${filters.to}.csv`, rows);
  };

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Transactions"
        title="Daybook"
        subtitle="Selected period ke saare vouchers, ek jagah."
        actions={(
          <>
            <Button icon="refresh" onClick={load}>Refresh</Button>
            <Button icon="download" onClick={exportCSV}>Excel / CSV</Button>
            {hasCap('voucher:create') && <Button variant="primary" icon="plus" onClick={() => navigate('/vouchers/new/SALES')}>New voucher</Button>}
          </>
        )}
      />

      <Card>
        <div className="filter-bar">
          <Field label="From"><TextInput type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="Voucher type">
            <SelectInput value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
              {TYPES.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All types' : VOUCHER_META[t].label}</option>)}
            </SelectInput>
          </Field>
          <Field label="Search" className="grow">
            <div className="field-row">
              <SearchInput value={filters.q} onChange={v => setFilters({ ...filters, q: v })} placeholder="Voucher no, party ya narration..." />
              <Button onClick={load} icon="search">Search</Button>
            </div>
          </Field>
        </div>
        <div className="filter-stats">
          <span><strong>{summary.count}</strong> vouchers</span>
          <span>Total <strong className="mono">{money(summary.total)}</strong></span>
          {Object.entries(summary.byType).slice(0, 6).map(([t, c]) => (
            <span key={t} className="muted">{voucherLabel(t)}: <strong>{c}</strong></span>
          ))}
        </div>
      </Card>

      {loading ? <Loading label="Daybook load ho raha hai..." /> : error ? <ErrorBox error={error} onRetry={load} /> : (
        <Card flush>
          {list.length ? (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th>Account / Party</th>
                    <th>Narration</th>
                    <th className="text-right">Taxable</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map(v => (
                    <tr key={v.id} className="clickable" onClick={() => openDetail(v)}>
                      <td>{fmtDate(v.date)}</td>
                      <td className="mono">{v.number}</td>
                      <td><span className={`tag tag-${voucherTone(v.type)}`}>{voucherLabel(v.type)}</span></td>
                      <td>
                        <div className="cell-strong">{v.account_name || '—'}</div>
                        {v.item_count > 0 && <div className="row-hint">{v.item_count} item{v.item_count > 1 ? 's' : ''}</div>}
                      </td>
                      <td className="truncate" title={v.narration}>{v.narration || '—'}</td>
                      <td className="text-right mono">{money(v.taxable)}</td>
                      <td className="text-right mono">{money(Number(v.cgst || 0) + Number(v.sgst || 0) + Number(v.igst || 0))}</td>
                      <td className="text-right mono cell-strong">{money(v.total)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row-actions">
                          <button type="button" className="icon-btn" title="View" onClick={() => openDetail(v)}><Icon name="search" size={15} /></button>
                          {(v.type === 'SALES' || v.type === 'DEBIT_NOTE') && (
                            <button type="button" className="icon-btn" title="Print invoice" onClick={() => window.open(`/print/voucher/${v.id}`, '_blank')}><Icon name="print" size={15} /></button>
                          )}
                          {hasCap('voucher:create') && (
                            <button type="button" className="icon-btn" title="Edit" onClick={() => navigate(`/vouchers/${v.id}/edit`)}><Icon name="edit" size={15} /></button>
                          )}
                          {hasCap('voucher:delete') && (
                            <button type="button" className="icon-btn danger" title="Delete" onClick={() => setDeleteTarget(v)}><Icon name="trash" size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Is period me koi voucher nahi"
              subtitle="Date range badlo ya naya voucher banao."
              icon="book"
              action={hasCap('voucher:create') ? <Button variant="primary" icon="plus" onClick={() => navigate('/vouchers/new/SALES')}>New sale voucher</Button> : null}
            />
          )}
        </Card>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.loading ? 'Loading...' : `${detail?.number || ''} · ${voucherLabel(detail?.type)}`}
        subtitle={detail?.date ? `${fmtDate(detail.date)} · Created by ${detail.created_by_name || '—'}` : ''}
        width={860}
        footer={detail && !detail.loading ? (
          <div className="modal-inline-actions">
            {hasCap('voucher:delete') && (
              <Button variant="danger" icon="trash" onClick={() => setDeleteTarget(detail)}>Delete</Button>
            )}
            {(detail.type === 'SALES' || detail.type === 'DEBIT_NOTE') && (
              <Button icon="print" onClick={() => window.open(`/print/voucher/${detail.id}`, '_blank')}>Print invoice</Button>
            )}
            <Button variant="primary" onClick={() => setDetail(null)}>Close</Button>
          </div>
        ) : null}
      >
        {detail?.loading || detailLoading ? <Loading /> : detail ? (
          <div className="stack">
            <div className="detail-grid">
              <div><small>Party / Account</small><strong>{detail.party_name || detail.from_name || detail.to_name || '—'}</strong></div>
              <div><small>Total</small><strong className="mono">{money(detail.total)}</strong></div>
              <div><small>Taxable</small><strong className="mono">{money(detail.taxable)}</strong></div>
              <div><small>GST</small><strong className="mono">{money(Number(detail.cgst || 0) + Number(detail.sgst || 0) + Number(detail.igst || 0))}</strong></div>
              <div><small>Place of supply</small><strong>{detail.place_of_supply || '—'}</strong></div>
              <div><small>Payment mode</small><strong>{detail.payment_mode || '—'}</strong></div>
            </div>

            {detail.items?.length > 0 && (
              <div>
                <h4 className="section-mini">Items</h4>
                <div className="table-wrapper">
                  <table className="table table-compact">
                    <thead><tr><th>Item</th><th>Godown</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
                    <tbody>
                      {detail.items.map(it => (
                        <tr key={it.id}>
                          <td>{it.item_name}<div className="row-hint">HSN {it.hsn || '—'}</div></td>
                          <td>{it.godown_name || '—'}</td>
                          <td className="text-right mono">{it.qty} {it.unit_symbol || ''}</td>
                          <td className="text-right mono">{money(it.rate)}</td>
                          <td className="text-right mono">{it.gst_rate}%</td>
                          <td className="text-right mono">{money(it.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="section-mini">Ledger entries (double entry)</h4>
              <div className="table-wrapper">
                <table className="table table-compact">
                  <thead><tr><th>Ledger</th><th>Group</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
                  <tbody>
                    {detail.entries?.map(e => (
                      <tr key={e.id}>
                        <td>{e.ledger_name}</td>
                        <td className="muted">{e.group_name || '—'}</td>
                        <td className="text-right mono">{e.entry_type === 'Dr' ? money(e.amount) : '—'}</td>
                        <td className="text-right mono">{e.entry_type === 'Cr' ? money(e.amount) : '—'}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td colSpan={2}>Total</td>
                      <td className="text-right mono">{money(detail.entries?.filter(e => e.entry_type === 'Dr').reduce((s, e) => s + e.amount, 0))}</td>
                      <td className="text-right mono">{money(detail.entries?.filter(e => e.entry_type === 'Cr').reduce((s, e) => s + e.amount, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {detail.narration && <div className="info-panel"><Icon name="file" size={16} /><p>{detail.narration}</p></div>}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Voucher delete karna hai?"
        subtitle={deleteTarget ? `${deleteTarget.number} · ${money(deleteTarget.total)}` : ''}
        width={440}
        footer={(
          <div className="modal-inline-actions">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon="trash" onClick={confirmDelete} disabled={busy}>{busy ? 'Deleting...' : 'Delete permanently'}</Button>
          </div>
        )}
      >
        <p className="muted" style={{ margin: 0 }}>
          Delete karne par ledger entries aur stock movement bhi hat jayenge. Ye action audit log me record hoga.
          {deleteTarget?.date && <><br />Date: {fmtDate(deleteTarget.date)}</>}
        </p>
      </Modal>
    </div>
  );
}
