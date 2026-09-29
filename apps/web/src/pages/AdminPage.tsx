import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { DashboardStats } from '../features/admin/components/DashboardStats';
import { DetailDrawer } from '../features/admin/components/DetailDrawer';
import { RefundDetail } from '../features/admin/components/RefundDetail';
import { FILTERS, RefundFilters } from '../features/admin/components/RefundFilters';
import { RefundTable } from '../features/admin/components/RefundTable';
import { useResource } from '../lib/useResource';
import type { RefundFilter } from '../types';

/** The overview (summary cards) and each filtered table view load at most this many recent requests. */
export const WINDOW_SIZE = 100;

const FILTER_PARAM: Record<RefundFilter, string | null> = { ALL: null, APPROVED: 'approved', DENIED: 'denied', ESCALATED: 'review' };
const parseFilter = (value: string | null): RefundFilter =>
  (Object.entries(FILTER_PARAM).find(([, param]) => param === value)?.[0] as RefundFilter | undefined) ?? 'ALL';

function loadError(error: unknown, what: string) {
  if (error instanceof ApiError && error.kind === 'network') return `Couldn't reach the API to load ${what}. Check that the backend is running.`;
  if (error instanceof ApiError && error.status === 404) return `This ${what} no longer exists.`;
  return `Couldn't load ${what}. Please try again.`;
}

/**
 * Internal support dashboard. Shows diagnostics hidden from customers (reason codes, rule trace,
 * classification, audit events). There is no authentication in this assessment: do not expose it publicly.
 */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('filter'));
  const [refreshToken, setRefreshToken] = useState(0);

  // Summary cards always describe the unfiltered recent window; the table uses server-side filtering.
  const overview = useResource(`refunds:all:${refreshToken}`, (signal) => api.refunds({ limit: WINDOW_SIZE }, signal));
  const filtered = useResource(filter === 'ALL' ? null : `refunds:${filter}:${refreshToken}`, (signal) =>
    api.refunds({ decision: filter as Exclude<RefundFilter, 'ALL'>, limit: WINDOW_SIZE }, signal)
  );
  const table = filter === 'ALL' ? overview : filtered;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useResource(selectedId ? `refund:${selectedId}` : null, (signal) => api.refund(selectedId!, signal));
  const triggerRef = useRef<HTMLElement | null>(null);

  function changeFilter(next: RefundFilter) {
    const param = FILTER_PARAM[next];
    setParams(param ? { filter: param } : {}, { replace: true });
  }

  function openDetail(requestId: string, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setSelectedId(requestId);
  }

  function closeDetail() {
    setSelectedId(null);
    // Return focus to the row's View button so keyboard users keep their place.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const refresh = () => setRefreshToken((n) => n + 1);
  const filterLabel = FILTERS.find((f) => f.value === filter)!.label;

  return (
    <div className="page admin-page">
      <header className="page-intro admin-intro">
        <div>
          <p className="eyebrow">Support operations</p>
          <h1>Refund dashboard</h1>
          <p className="lead">Recent refund decisions with the facts, classification, policy trace and audit trail behind each one.</p>
        </div>
        <button type="button" className="button-secondary" onClick={refresh}>
          <span aria-hidden="true">↻ </span>Refresh
        </button>
      </header>

      <DashboardStats overview={overview.resource} windowSize={WINDOW_SIZE} />

      <section className="card table-card" aria-labelledby="requests-title">
        <div className="table-toolbar">
          <h2 id="requests-title">Requests</h2>
          <RefundFilters value={filter} onChange={changeFilter} />
        </div>

        {table.resource.status === 'loading' || table.resource.status === 'idle' ? (
          <div className="table-state" role="status">
            <span className="spinner" aria-hidden="true" /> Loading requests…
          </div>
        ) : table.resource.status === 'error' ? (
          <div className="inline-alert" role="alert">
            <p>{loadError(table.resource.error, 'refund requests')}</p>
            <button type="button" className="button-secondary" onClick={table.retry}>
              Try again
            </button>
          </div>
        ) : table.resource.data.items.length === 0 ? (
          <div className="table-state empty">
            <p className="empty-title">{filter === 'ALL' ? 'No refund requests yet' : `No “${filterLabel}” requests`}</p>
            <p className="muted">
              {filter === 'ALL'
                ? 'Requests submitted through the Refund Assistant will appear here.'
                : 'Nothing in the recent requests matches this filter.'}
            </p>
            {filter !== 'ALL' && (
              <button type="button" className="button-secondary" onClick={() => changeFilter('ALL')}>
                Show all requests
              </button>
            )}
          </div>
        ) : (
          <RefundTable rows={table.resource.data.items} selectedId={selectedId} onOpen={openDetail} />
        )}
      </section>

      {selectedId && (
        <DetailDrawer title="Refund request" onClose={closeDetail}>
          {detail.resource.status === 'ready' ? (
            <RefundDetail detail={detail.resource.data} />
          ) : detail.resource.status === 'error' ? (
            <div className="inline-alert" role="alert">
              <p>{loadError(detail.resource.error, 'refund request')}</p>
              <button type="button" className="button-secondary" onClick={detail.retry}>
                Try again
              </button>
            </div>
          ) : (
            <div className="table-state" role="status">
              <span className="spinner" aria-hidden="true" /> Loading details…
            </div>
          )}
        </DetailDrawer>
      )}
    </div>
  );
}
