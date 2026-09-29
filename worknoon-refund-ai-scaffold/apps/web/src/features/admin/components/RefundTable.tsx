import { formatCurrency, formatDateTime } from '../../../lib/format';
import type { RefundSummary } from '../../../types';
import { reasonLabel } from '../labels';
import { OutcomeBadge } from './OutcomeBadge';

interface Props {
  rows: RefundSummary[];
  selectedId: string | null;
  onOpen: (requestId: string, trigger: HTMLElement) => void;
}

const CLASSIFICATION_LABEL: Record<string, string> = { SUCCEEDED: 'Classified', FAILED: 'Failed', SKIPPED: 'Skipped' };

/**
 * Rows are clickable for mouse users; each row also has an explicit "View" button,
 * which is the keyboard and screen-reader path (no custom row focus handling needed).
 */
export function RefundTable({ rows, selectedId, onOpen }: Props) {
  return (
    <div className="table-scroll" role="region" aria-label="Refund requests" tabIndex={0}>
      <table className="refund-table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Order</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col">Outcome</th>
            <th scope="col">Reason</th>
            <th scope="col">Created</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.requestId}
              className={row.requestId === selectedId ? 'is-selected' : undefined}
              onClick={(e) => {
                const button = (e.currentTarget as HTMLElement).querySelector('button');
                if (button) onOpen(row.requestId, button);
              }}
            >
              <td>
                <span className="cell-primary">{row.customerName ?? 'Not recorded'}</span>
              </td>
              <td className="mono">{row.orderNumber}</td>
              <td className="num">{row.amount === null ? '—' : formatCurrency(row.amount)}</td>
              <td>
                <OutcomeBadge decision={row.decision} />
              </td>
              <td>
                <span className="cell-primary">{reasonLabel(row.reasonCode)}</span>
                {row.classificationStatus && row.classificationStatus !== 'SUCCEEDED' && (
                  <span className={`chip chip-${row.classificationStatus.toLowerCase()}`}>
                    AI: {CLASSIFICATION_LABEL[row.classificationStatus]}
                  </span>
                )}
              </td>
              <td className="nowrap">{row.createdAt ? formatDateTime(row.createdAt) : '—'}</td>
              <td>
                <button
                  type="button"
                  className="button-secondary button-small"
                  aria-label={`View ${row.orderNumber} request from ${row.customerName ?? 'unknown customer'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(row.requestId, e.currentTarget);
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
