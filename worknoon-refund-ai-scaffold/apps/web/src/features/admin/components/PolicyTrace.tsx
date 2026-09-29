import { describeRule, RULE_MARKER } from '../labels';

/**
 * The stored rule trace, in evaluation order. No entry is singled out as "the" deciding rule:
 * when several risk flags are raised the engine records all of them, and the reason code
 * (shown in the Outcome section) is the authoritative statement of the decision.
 */
export function PolicyTrace({ rules }: { rules: string[] }) {
  if (rules.length === 0) {
    return <p className="muted">No policy rules were recorded (policy was not evaluated for this request).</p>;
  }
  return (
    <ol className="rule-trace">
      {rules.map((code, i) => {
        const rule = describeRule(code);
        const marker = RULE_MARKER[rule.kind];
        return (
          <li key={`${code}-${i}`} className={`rule rule-${rule.kind}`}>
            <span className="rule-icon" aria-hidden="true">
              {marker.icon}
            </span>
            <span className="rule-body">
              <span className="rule-label">
                {rule.label}
                <span className="visually-hidden"> ({marker.text})</span>
              </span>
              <code className="rule-code">{code}</code>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
