import type { RefundFilter } from '../../../types';

export const FILTERS: Array<{ value: RefundFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DENIED', label: 'Denied' },
  { value: 'ESCALATED', label: 'Needs review' }
];

interface Props {
  value: RefundFilter;
  onChange: (filter: RefundFilter) => void;
}

/** Toggle-button group; the selected filter is conveyed by aria-pressed and a visible style, not colour alone. */
export function RefundFilters({ value, onChange }: Props) {
  return (
    <div className="filter-group" role="group" aria-label="Filter by outcome">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          className="filter-button"
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          {value === filter.value && <span aria-hidden="true">✓ </span>}
          {filter.label}
        </button>
      ))}
    </div>
  );
}
