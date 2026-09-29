import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import {
  RefundRequest,
  type AuditEvent,
  type ClassificationAudit,
  type DecisionFacts,
  type RefundRequestRecord
} from '../models/RefundRequest.js';
import type { PolicyRequestSignals } from './policy.service.js';
import { evaluateRefundPolicy } from './policy.service.js';
import { ClassificationError, type RefundClassifier } from './ai/index.js';
import { AI_UNAVAILABLE_OUTCOME, explainOutcome, type RefundOutcome } from './refundOutcome.js';
import type { CreateRefundInput } from '../validators/refund.validator.js';

export interface WorkflowLogger {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
}

export interface RefundWorkflowDeps {
  classifier: RefundClassifier;
  /** Injected clock for the policy's evaluation time. */
  now: () => Date;
  logger: WorkflowLogger;
}

export type StoredRefundRequest = RefundRequestRecord & { _id: mongoose.Types.ObjectId };

export interface WorkflowResult {
  record: StoredRefundRequest;
  /** True when an earlier request with the same idempotency key was returned instead of processing again. */
  replayed: boolean;
}

/** The same idempotency key was reused with a different payload. */
export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used for a different refund request.');
    this.name = 'IdempotencyConflictError';
  }
}

/**
 * Signals used when classification is skipped because the customer/order
 * relationship is invalid. The policy engine denies on relationship rules before
 * it reads any signal, and these values could never lead to approval anyway.
 */
const NO_SIGNALS: PolicyRequestSignals = { reason: 'OTHER', suspicious: false, conflicting: false, promptInjectionDetected: false };

/**
 * Runs one refund attempt end to end and persists exactly one record:
 * load facts → verify relationship → classify → decide → persist.
 *
 * Authoritative facts (ownership, amount, dates, final-sale) come only from the
 * database. AI output contributes signals only. If classification fails, the
 * request is escalated by the workflow; it is never approved or denied.
 */
export async function submitRefundRequest(
  input: CreateRefundInput,
  idempotencyKey: string | undefined,
  deps: RefundWorkflowDeps
): Promise<WorkflowResult> {
  const startedAt = Date.now();
  const fingerprint = idempotencyKey ? fingerprintOf(input) : undefined;

  if (idempotencyKey) {
    const existing = await RefundRequest.findOne({ idempotencyKey }).lean<StoredRefundRequest>();
    if (existing) return replay(existing, fingerprint!, deps);
  }

  const events: AuditEvent[] = [];
  const record = (type: AuditEvent['type'], data?: Record<string, unknown>) => events.push({ type, at: new Date(), data });
  record('REQUEST_RECEIVED', { orderNumber: input.orderNumber, idempotencyKeyProvided: Boolean(idempotencyKey) });

  // 1. Authoritative facts.
  const [customer, order] = await Promise.all([
    Customer.findById(input.customerId).lean(),
    Order.findOne({ orderNumber: input.orderNumber }).lean()
  ]);
  const ownershipVerified = Boolean(customer && order && order.customerId.equals(customer._id));
  const evaluatedAt = deps.now();
  const facts: DecisionFacts = {
    evaluatedAt,
    customerFound: Boolean(customer),
    customerName: customer?.name ?? null,
    orderFound: Boolean(order),
    orderOwnerCustomerId: order?.customerId ?? null,
    ownershipVerified,
    itemName: order?.itemName ?? null,
    orderTotal: order?.total ?? null,
    orderedAt: order?.orderedAt ?? null,
    isFinalSale: order ? (order.isFinalSale ?? false) : null
  };
  record('FACTS_LOADED', { customerFound: facts.customerFound, orderFound: facts.orderFound, ownershipVerified });

  // 2. Classification: only for a verified customer/order pair. An invalid relationship is denied on facts
  //    alone, so the message is not sent to the AI provider at all.
  let classification: ClassificationAudit;
  if (!ownershipVerified) {
    classification = { status: 'SKIPPED', provider: null, failureKind: null, durationMs: null, result: null };
    record('CLASSIFICATION_SKIPPED', { cause: 'CUSTOMER_ORDER_RELATIONSHIP_INVALID' });
  } else {
    classification = await classify(input.message, deps.classifier);
    record(
      classification.status === 'SUCCEEDED' ? 'CLASSIFICATION_SUCCEEDED' : 'CLASSIFICATION_FAILED',
      { provider: classification.provider, durationMs: classification.durationMs, failureKind: classification.failureKind ?? undefined }
    );
  }

  // 3. Decision.
  let outcome: RefundOutcome;
  if (classification.status === 'FAILED') {
    outcome = AI_UNAVAILABLE_OUTCOME;
    record('ESCALATED_WITHOUT_POLICY', { reasonCode: outcome.reasonCode });
  } else {
    const policy = evaluateRefundPolicy({
      requestingCustomerId: customer ? String(customer._id) : null,
      order: order
        ? { customerId: String(order.customerId), total: order.total, orderedAt: order.orderedAt, isFinalSale: order.isFinalSale ?? false }
        : null,
      signals: classification.result ?? NO_SIGNALS,
      evaluatedAt
    });
    outcome = { ...policy, decidedBy: 'POLICY_ENGINE' };
    record('POLICY_EVALUATED', { decision: policy.decision, reasonCode: policy.reasonCode });
  }

  // 4. Persist once.
  const doc = {
    customerId: new mongoose.Types.ObjectId(input.customerId),
    orderNumber: input.orderNumber,
    message: input.message,
    orderId: order?._id ?? null,
    amount: order?.total ?? null,
    facts,
    classification,
    decision: outcome.decision,
    reasonCode: outcome.reasonCode,
    humanReviewRequired: outcome.humanReviewRequired,
    explanation: explainOutcome(outcome.reasonCode),
    matchedRules: outcome.matchedRules,
    decidedBy: outcome.decidedBy,
    auditEvents: events,
    ...(idempotencyKey ? { idempotencyKey, requestFingerprint: fingerprint } : {})
  };

  let saved: StoredRefundRequest;
  try {
    saved = (await RefundRequest.create(doc)).toObject() as StoredRefundRequest;
  } catch (error) {
    // Two concurrent submissions with the same key: the other one won the insert, so return its result.
    if (idempotencyKey && isDuplicateKeyError(error)) {
      const existing = await RefundRequest.findOne({ idempotencyKey }).lean<StoredRefundRequest>();
      if (existing) return replay(existing, fingerprint!, deps);
    }
    throw error;
  }

  deps.logger.info(
    {
      requestId: String(saved._id),
      decision: saved.decision,
      reasonCode: saved.reasonCode,
      decidedBy: saved.decidedBy,
      classificationStatus: classification.status,
      classificationProvider: classification.provider ?? undefined,
      failureKind: classification.failureKind ?? undefined,
      humanReviewRequired: saved.humanReviewRequired,
      durationMs: Date.now() - startedAt
    },
    'refund request decided'
  );
  return { record: saved, replayed: false };
}

async function classify(message: string, classifier: RefundClassifier): Promise<ClassificationAudit> {
  const startedAt = Date.now();
  try {
    const result = await classifier.classify(message);
    return { status: 'SUCCEEDED', provider: classifier.provider, failureKind: null, durationMs: Date.now() - startedAt, result };
  } catch (error) {
    // Anything the classifier throws is treated as "no signals available". Only the failure kind is kept;
    // the error object itself (which could carry provider text) is never stored or logged here.
    return {
      status: 'FAILED',
      provider: classifier.provider,
      failureKind: error instanceof ClassificationError ? error.kind : 'PROVIDER_ERROR',
      durationMs: Date.now() - startedAt,
      result: null
    };
  }
}

function replay(existing: StoredRefundRequest, fingerprint: string, deps: RefundWorkflowDeps): WorkflowResult {
  if (existing.requestFingerprint !== fingerprint) throw new IdempotencyConflictError();
  deps.logger.info({ requestId: String(existing._id), decision: existing.decision }, 'refund request replayed from idempotency key');
  return { record: existing, replayed: true };
}

function fingerprintOf(input: CreateRefundInput): string {
  return createHash('sha256').update(JSON.stringify([input.customerId.toLowerCase(), input.orderNumber, input.message])).digest('hex');
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}
