import type { RefundDecision } from '../../../types';

const BADGES: Record<RefundDecision, { label: string; icon: string }> = {
  APPROVED: { label: 'Approved', icon: '✓' },
  DENIED: { label: 'Not approved', icon: '✕' },
  ESCALATED: { label: 'In review', icon: '…' }
};

/** Decision badge: icon and text carry the meaning; colour only reinforces it. */
export function StatusBadge({ decision }: { decision: RefundDecision }) {
  const { label, icon } = BADGES[decision];
  return (
    <span className={`status-badge status-${decision.toLowerCase()}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
