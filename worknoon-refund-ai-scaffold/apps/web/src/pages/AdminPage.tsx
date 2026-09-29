import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { RefundResult } from '../types';

export function AdminPage() {
  const [refunds, setRefunds] = useState<RefundResult[]>([]);
  useEffect(() => { api.refunds().then(setRefunds).catch(console.error); }, []);
  const counts = useMemo(() => ({
    total: refunds.length,
    approved: refunds.filter(r => r.decision === 'APPROVED').length,
    denied: refunds.filter(r => r.decision === 'DENIED').length,
    escalated: refunds.filter(r => r.decision === 'ESCALATED').length
  }), [refunds]);

  return <section className="stack">
    <div><p className="eyebrow">SUPPORT OPERATIONS</p><h1>Refund dashboard</h1><p className="muted">Recent automated decisions and audit signals.</p></div>
    <div className="stats"><div className="card"><span>Total</span><strong>{counts.total}</strong></div><div className="card"><span>Approved</span><strong>{counts.approved}</strong></div><div className="card"><span>Denied</span><strong>{counts.denied}</strong></div><div className="card"><span>Escalated</span><strong>{counts.escalated}</strong></div></div>
    <div className="card table-wrap"><table><thead><tr><th>Order</th><th>Amount</th><th>Decision</th><th>Reason</th><th>Created</th></tr></thead><tbody>{refunds.map((r, i) => <tr key={r._id ?? i}><td>{r.orderNumber ?? '—'}</td><td>{typeof r.amount === 'number' ? `$${r.amount}` : '—'}</td><td><span className={`pill ${r.decision.toLowerCase()}`}>{r.decision}</span></td><td>{r.explanation}</td><td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>
  </section>;
}
