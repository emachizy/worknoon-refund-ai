import { formatTime } from '../../../lib/format';
import type { AuditEvent } from '../../../types';
import { eventLabel, eventSummary } from '../labels';

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">No audit events were recorded for this request.</p>;
  }
  const sorted = [...events].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  return (
    <ol className="timeline">
      {sorted.map((event, i) => {
        const summary = eventSummary(event);
        return (
          <li key={`${event.type}-${i}`} className="timeline-item">
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <p className="timeline-title">
                {eventLabel(event.type)}
                {event.at && (
                  <time className="timeline-time" dateTime={event.at}>
                    {formatTime(event.at)}
                  </time>
                )}
              </p>
              {summary && <p className="timeline-summary">{summary}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
