import type { StoredRefundRequest } from './refundWorkflow.js';

/**
 * Explicit response shapes. Records are always mapped through these functions,
 * so internal fields (idempotency data, Mongo internals) are never serialised by accident.
 */

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);
const id = (value: { toString(): string } | null | undefined) => (value ? value.toString() : null);

/**
 * Customer-facing result of POST /api/refunds: the outcome and customer-safe wording only.
 * Reason codes, the policy rule trace, AI output, provider and failure details, and security
 * flags are internal diagnostics and appear only in the admin endpoints.
 */
export function toCustomerResponse(record: StoredRefundRequest) {
  return {
    requestId: String(record._id),
    decision: record.decision,
    humanReviewRequired: record.humanReviewRequired,
    explanation: record.explanation,
    createdAt: iso(record.createdAt)
  };
}

/** Row for the admin list. */
export function toAdminSummary(record: StoredRefundRequest) {
  return {
    requestId: String(record._id),
    createdAt: iso(record.createdAt),
    customerId: id(record.customerId),
    customerName: record.facts?.customerName ?? null,
    orderNumber: record.orderNumber,
    amount: record.amount ?? null,
    decision: record.decision,
    reasonCode: record.reasonCode,
    humanReviewRequired: record.humanReviewRequired,
    explanation: record.explanation,
    classificationStatus: record.classification?.status ?? null
  };
}

/** Full audit detail for GET /api/refunds/:id (admin/support use). */
export function toAdminDetail(record: StoredRefundRequest) {
  const { facts, classification } = record;
  return {
    requestId: String(record._id),
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
    request: {
      customerId: id(record.customerId),
      orderNumber: record.orderNumber,
      message: record.message
    },
    facts: facts && {
      evaluatedAt: iso(facts.evaluatedAt),
      customerFound: facts.customerFound,
      customerName: facts.customerName,
      orderFound: facts.orderFound,
      orderId: id(record.orderId),
      orderOwnerCustomerId: id(facts.orderOwnerCustomerId),
      ownershipVerified: facts.ownershipVerified,
      itemName: facts.itemName,
      orderTotal: facts.orderTotal,
      orderedAt: iso(facts.orderedAt),
      isFinalSale: facts.isFinalSale
    },
    classification: classification && {
      status: classification.status,
      provider: classification.provider,
      failureKind: classification.failureKind,
      durationMs: classification.durationMs,
      result: classification.result
    },
    outcome: {
      decision: record.decision,
      reasonCode: record.reasonCode,
      humanReviewRequired: record.humanReviewRequired,
      explanation: record.explanation,
      matchedRules: record.matchedRules,
      decidedBy: record.decidedBy ?? null,
      amount: record.amount ?? null
    },
    auditEvents: (record.auditEvents ?? []).map((event) => ({ type: event.type, at: iso(event.at), data: event.data ?? {} }))
  };
}
