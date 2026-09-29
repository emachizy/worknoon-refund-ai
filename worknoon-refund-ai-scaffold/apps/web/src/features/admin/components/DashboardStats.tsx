import type { RefundPage, RefundSummary } from '../../../types';
import type { Resource } from '../../../lib/useResource';

interface Props {
  overview: Resource<RefundPage>;
  windowSize: number;
}

/** Counts over the most recent loaded window, not global totals (there is no analytics API). */
export function DashboardStats({ overview, windowSize }: Props) {
  const items = overview.status === 'ready' ? overview.data.items : null;
  const count = (decision?: RefundSummary['decision']) =>
    items ? (decision ? items.filter((r) => r.decision === decision).length : items.length) : null;

  const cards = [
    { key: 'total', label: 'Total', value: count(), icon: '' },
    { key: 'approved', label: 'Approved', value: count('APPROVED'), icon: '✓' },
    { key: 'denied', label: 'Denied', value: count('DENIED'), icon: '✕' },
    { key: 'escalated', label: 'Needs review', value: count('ESCALATED'), icon: '⚠' }
  ];

  const caption = items
    ? items.length >= windowSize
      ? `Counts cover the ${windowSize} most recent requests; older requests are not included.`
      : `Counts cover all ${items.length} recent request${items.length === 1 ? '' : 's'}.`
    : overview.status === 'error'
      ? 'Counts are unavailable right now.'
      : 'Loading counts…';

  return (
    <section aria-labelledby="stats-title" className="stats-section">
      <div className="section-heading">
        <h2 id="stats-title">Overview</h2>
        <p className="muted small">{caption}</p>
      </div>
      <dl className="stats">
        {cards.map((card) => (
          <div key={card.key} className={`card stat stat-${card.key}`}>
            <dt>
              {card.icon && <span aria-hidden="true">{card.icon} </span>}
              {card.label}
            </dt>
            <dd>{card.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
