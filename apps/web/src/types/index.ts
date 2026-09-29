export interface Customer {
  _id: string;
  name: string;
  email: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  itemName: string;
  total: number;
  currency: string;
  orderedAt: string;
  isFinalSale: boolean;
}

export type RefundDecision = 'APPROVED' | 'DENIED' | 'ESCALATED';

export interface RefundRequestPayload {
  customerId: string;
  orderNumber: string;
  message: string;
}

/** Customer-safe result of POST /api/refunds. Internal diagnostics are intentionally not part of it. */
export interface RefundResult {
  requestId: string;
  decision: RefundDecision;
  humanReviewRequired: boolean;
  explanation: string;
  createdAt: string;
}

// ---------- Support dashboard (admin endpoints) ----------
// Records created before the Phase 4 audit fields existed lack facts, classification, decidedBy and audit
// events, so everything not guaranteed by the API is nullable and the UI must degrade gracefully.

export type ClassificationStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export type RefundFilter = 'ALL' | RefundDecision;

export interface RefundListQuery {
  decision?: RefundDecision;
  limit?: number;
}

/** Row of GET /api/refunds. */
export interface RefundSummary {
  requestId: string;
  createdAt: string | null;
  customerName: string | null;
  orderNumber: string;
  amount: number | null;
  decision: RefundDecision;
  reasonCode: string | null;
  humanReviewRequired: boolean | null;
  classificationStatus: ClassificationStatus | null;
}

export interface RefundPage {
  items: RefundSummary[];
  limit: number;
}

/** Authoritative database facts snapshotted at decision time. */
export interface DecisionFacts {
  evaluatedAt: string | null;
  customerFound: boolean | null;
  customerName: string | null;
  orderFound: boolean | null;
  ownershipVerified: boolean | null;
  itemName: string | null;
  orderTotal: number | null;
  orderedAt: string | null;
  isFinalSale: boolean | null;
}

/** Validated structured classifier output. There is no reasoning text, by design. */
export interface ClassificationResult {
  intent: string | null;
  reason: string | null;
  confidence: number | null;
  suspicious: boolean | null;
  conflicting: boolean | null;
  promptInjectionDetected: boolean | null;
  extractedFacts: string[];
}

export interface ClassificationAudit {
  status: ClassificationStatus | null;
  provider: string | null;
  failureKind: string | null;
  durationMs: number | null;
  result: ClassificationResult | null;
}

export type AuditValue = string | number | boolean | null;

export interface AuditEvent {
  type: string;
  at: string | null;
  /** Primitive values only; nested structures are dropped during parsing. */
  data: Record<string, AuditValue>;
}

/** GET /api/refunds/:id */
export interface RefundDetail {
  requestId: string;
  createdAt: string | null;
  request: {
    customerId: string | null;
    orderNumber: string | null;
    message: string | null;
  };
  facts: DecisionFacts | null;
  classification: ClassificationAudit | null;
  outcome: {
    decision: RefundDecision;
    reasonCode: string | null;
    humanReviewRequired: boolean | null;
    explanation: string | null;
    matchedRules: string[];
    decidedBy: string | null;
    amount: number | null;
  };
  auditEvents: AuditEvent[];
}
