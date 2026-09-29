import type { RefundDecision } from '../../../types';
import { OUTCOME } from '../labels';

/** Outcome badge: icon + text carry the meaning; colour only reinforces it. */
export function OutcomeBadge({ decision, showCode = false }: { decision: RefundDecision; showCode?: boolean }) {
  const { label, icon } = OUTCOME[decision];
  return (
    <span className={`status-badge status-${decision.toLowerCase()}`}>
      <span aria-hidden="true">{icon}</span> {label}
      {showCode && <span className="badge-code">{decision}</span>}
    </span>
  );
}
