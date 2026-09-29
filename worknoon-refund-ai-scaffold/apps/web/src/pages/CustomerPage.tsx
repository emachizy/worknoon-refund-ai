import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Customer, Order, RefundResult } from '../types';

export function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<RefundResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.customers().then(setCustomers).catch(console.error); }, []);
  useEffect(() => {
    if (!customerId) return setOrders([]);
    api.orders(customerId).then((data) => { setOrders(data); setOrderNumber(data[0]?.orderNumber ?? ''); }).catch(console.error);
  }, [customerId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setResult(null);
    try { setResult(await api.createRefund({ customerId, orderNumber, message })); }
    finally { setLoading(false); }
  }

  return <section className="grid two-col">
    <div className="card hero">
      <p className="eyebrow">CUSTOMER SUPPORT</p>
      <h1>Request a refund</h1>
      <p>Describe what happened. The system will review the order against refund policy and tell you what happens next.</p>
      <form onSubmit={submit} className="stack">
        <label>Customer<select value={customerId} onChange={e => setCustomerId(e.target.value)} required><option value="">Choose customer</option>{customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
        <label>Order<select value={orderNumber} onChange={e => setOrderNumber(e.target.value)} required><option value="">Choose order</option>{orders.map(o => <option key={o._id} value={o.orderNumber}>{o.orderNumber} — {o.itemName} (${o.total})</option>)}</select></label>
        <label>What happened?<textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Example: My headphones arrived cracked and I would like a refund." required /></label>
        <button disabled={loading}>{loading ? 'Reviewing…' : 'Submit refund request'}</button>
      </form>
    </div>
    <div className="card result-panel">
      <p className="eyebrow">DECISION</p>
      {!result ? <p className="muted">Your decision and policy explanation will appear here.</p> : <>
        <div className={`decision ${result.decision.toLowerCase()}`}>{result.decision}</div>
        <h2>{result.humanReviewRequired ? 'Human review required' : 'Automated review complete'}</h2>
        <p>{result.explanation}</p>
        <div className="rule-list">{result.matchedRules?.map(rule => <span key={rule}>{rule}</span>)}</div>
      </>}
    </div>
  </section>;
}
