import mongoose, { Schema, type Types } from 'mongoose';
import type { ClassificationFailureKind } from '../services/ai/index.js';
import type { DecidedBy, OutcomeReasonCode } from '../services/refundOutcome.js';
import type { AiClassification, RefundDecision } from '../types/refund.js';

/**
 * One document per refund attempt, written once when the workflow finishes.
 * Sections: what was submitted (untrusted), the authoritative facts used, the
 * classification outcome, the decision, and an audit event trail. Never stored:
 * API keys, raw provider errors, stack traces, prompts, or model reasoning.
 */

export const CLASSIFICATION_STATUSES = ['SUCCEEDED', 'FAILED', 'SKIPPED'] as const;
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export interface ClassificationAudit {
  status: ClassificationStatus;
  /** Provider name, e.g. "openai" or "mock". Null when classification was skipped. */
  provider: string | null;
  failureKind: ClassificationFailureKind | null;
  durationMs: number | null;
  /** Validated structured output. Present only when status is SUCCEEDED. */
  result: AiClassification | null;
}

/** Snapshot of the database facts at decision time, so later edits to an order cannot rewrite history. */
export interface DecisionFacts {
  evaluatedAt: Date;
  customerFound: boolean;
  customerName: string | null;
  orderFound: boolean;
  orderOwnerCustomerId: Types.ObjectId | null;
  ownershipVerified: boolean;
  itemName: string | null;
  orderTotal: number | null;
  orderedAt: Date | null;
  isFinalSale: boolean | null;
}

export const AUDIT_EVENT_TYPES = [
  'REQUEST_RECEIVED',
  'FACTS_LOADED',
  'CLASSIFICATION_SUCCEEDED',
  'CLASSIFICATION_FAILED',
  'CLASSIFICATION_SKIPPED',
  'POLICY_EVALUATED',
  'ESCALATED_WITHOUT_POLICY'
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface AuditEvent {
  type: AuditEventType;
  at: Date;
  /** Small structured payload built by the workflow; never free text from customers or providers. */
  data?: Record<string, unknown>;
}

export interface RefundRequestRecord {
  /** Requesting customer id as submitted (a well-formed ObjectId; the customer may not exist). */
  customerId: Types.ObjectId;
  /** Order number as submitted (the order may not exist). */
  orderNumber: string;
  message: string;
  orderId: Types.ObjectId | null;
  /** Refund amount: the order total from the database, never from customer text. Null if the order was not found. */
  amount: number | null;
  facts: DecisionFacts;
  classification: ClassificationAudit;
  decision: RefundDecision;
  reasonCode: OutcomeReasonCode;
  humanReviewRequired: boolean;
  explanation: string;
  matchedRules: string[];
  decidedBy: DecidedBy;
  auditEvents: AuditEvent[];
  idempotencyKey?: string;
  requestFingerprint?: string;
  createdAt: Date;
  updatedAt: Date;
}

const factsSchema = new Schema<DecisionFacts>(
  {
    evaluatedAt: { type: Date, required: true },
    customerFound: { type: Boolean, required: true },
    customerName: { type: String, default: null },
    orderFound: { type: Boolean, required: true },
    orderOwnerCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    ownershipVerified: { type: Boolean, required: true },
    itemName: { type: String, default: null },
    orderTotal: { type: Number, default: null },
    orderedAt: { type: Date, default: null },
    isFinalSale: { type: Boolean, default: null }
  },
  { _id: false }
);

const classificationSchema = new Schema<ClassificationAudit>(
  {
    status: { type: String, enum: CLASSIFICATION_STATUSES, required: true },
    provider: { type: String, default: null },
    failureKind: { type: String, enum: ['TIMEOUT', 'PROVIDER_ERROR', 'INVALID_OUTPUT', 'REFUSED', null], default: null },
    durationMs: { type: Number, default: null },
    result: { type: Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

const auditEventSchema = new Schema<AuditEvent>(
  {
    type: { type: String, enum: AUDIT_EVENT_TYPES, required: true },
    at: { type: Date, required: true },
    data: { type: Schema.Types.Mixed }
  },
  { _id: false }
);

const refundRequestSchema = new Schema<RefundRequestRecord>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderNumber: { type: String, required: true },
    message: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    amount: { type: Number, default: null },
    facts: { type: factsSchema, required: true },
    classification: { type: classificationSchema, required: true },
    decision: { type: String, enum: ['APPROVED', 'DENIED', 'ESCALATED'], required: true },
    reasonCode: { type: String, required: true },
    humanReviewRequired: { type: Boolean, required: true },
    explanation: { type: String, required: true },
    matchedRules: [{ type: String }],
    decidedBy: { type: String, enum: ['POLICY_ENGINE', 'WORKFLOW'], required: true },
    auditEvents: { type: [auditEventSchema], default: [] },
    idempotencyKey: { type: String },
    requestFingerprint: { type: String }
  },
  { timestamps: true }
);

refundRequestSchema.index({ createdAt: -1, _id: -1 });
refundRequestSchema.index({ decision: 1, createdAt: -1, _id: -1 });
refundRequestSchema.index({ customerId: 1, createdAt: -1 });
// Unique only when a key was supplied; requests without a key are never deduplicated.
refundRequestSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const RefundRequest = mongoose.model<RefundRequestRecord>('RefundRequest', refundRequestSchema);
