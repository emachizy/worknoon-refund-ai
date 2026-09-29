import type {
  AuditEvent,
  AuditValue,
  ClassificationAudit,
  ClassificationResult,
  ClassificationStatus,
  Customer,
  DecisionFacts,
  Order,
  RefundDecision,
  RefundDetail,
  RefundListQuery,
  RefundPage,
  RefundRequestPayload,
  RefundResult,
  RefundSummary
} from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export type ApiErrorKind = 'network' | 'http' | 'invalid_response';

/**
 * The only error the client throws (besides aborts). It carries a category and
 * HTTP status, never server-provided text, so UI code cannot accidentally show
 * raw server messages.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number
  ) {
    super(`API request failed (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'ApiError';
  }
}

type Parser<T> = (value: unknown) => T | null;

async function request<T>(path: string, parse: Parser<T>, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError('network');
  }
  if (!response.ok) throw new ApiError('http', response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError('invalid_response', response.status);
  }
  const parsed = parse(body);
  if (parsed === null) throw new ApiError('invalid_response', response.status);
  return parsed;
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// ---------- response parsers: accept only the fields the UI needs, reject anything malformed ----------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const DECISIONS: readonly RefundDecision[] = ['APPROVED', 'DENIED', 'ESCALATED'];
const isDecision = (value: unknown): value is RefundDecision => DECISIONS.includes(value as RefundDecision);

function listOf<T>(item: Parser<T>): Parser<T[]> {
  return (value) => {
    if (!Array.isArray(value)) return null;
    const items = value.map(item);
    return items.every((x): x is T => x !== null) ? items : null;
  };
}

const parseCustomer: Parser<Customer> = (v) =>
  isRecord(v) && typeof v._id === 'string' && typeof v.name === 'string' && typeof v.email === 'string'
    ? { _id: v._id, name: v.name, email: v.email }
    : null;

const parseOrder: Parser<Order> = (v) =>
  isRecord(v) &&
  typeof v._id === 'string' &&
  typeof v.orderNumber === 'string' &&
  typeof v.itemName === 'string' &&
  typeof v.total === 'number' &&
  typeof v.orderedAt === 'string'
    ? {
        _id: v._id,
        orderNumber: v.orderNumber,
        itemName: v.itemName,
        total: v.total,
        currency: typeof v.currency === 'string' ? v.currency : 'USD',
        orderedAt: v.orderedAt,
        isFinalSale: v.isFinalSale === true
      }
    : null;

export const parseRefundResult: Parser<RefundResult> = (v) =>
  isRecord(v) &&
  typeof v.requestId === 'string' &&
  isDecision(v.decision) &&
  typeof v.humanReviewRequired === 'boolean' &&
  typeof v.explanation === 'string' &&
  typeof v.createdAt === 'string'
    ? {
        requestId: v.requestId,
        decision: v.decision,
        humanReviewRequired: v.humanReviewRequired,
        explanation: v.explanation,
        createdAt: v.createdAt
      }
    : null;

// ---------- admin parsers: identity + decision are required; everything else degrades to null ----------

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const STATUSES: readonly ClassificationStatus[] = ['SUCCEEDED', 'FAILED', 'SKIPPED'];
const status = (v: unknown): ClassificationStatus | null => (STATUSES.includes(v as ClassificationStatus) ? (v as ClassificationStatus) : null);

const parseRefundSummary: Parser<RefundSummary> = (v) =>
  isRecord(v) && typeof v.requestId === 'string' && typeof v.orderNumber === 'string' && isDecision(v.decision)
    ? {
        requestId: v.requestId,
        createdAt: str(v.createdAt),
        customerName: str(v.customerName),
        orderNumber: v.orderNumber,
        amount: num(v.amount),
        decision: v.decision,
        reasonCode: str(v.reasonCode),
        humanReviewRequired: bool(v.humanReviewRequired),
        classificationStatus: status(v.classificationStatus)
      }
    : null;

export const parseRefundPage: Parser<RefundPage> = (v) => {
  if (!isRecord(v)) return null;
  const items = listOf(parseRefundSummary)(v.items);
  return items ? { items, limit: num(v.limit) ?? items.length } : null;
};

const parseFacts = (v: unknown): DecisionFacts | null =>
  isRecord(v)
    ? {
        evaluatedAt: str(v.evaluatedAt),
        customerFound: bool(v.customerFound),
        customerName: str(v.customerName),
        orderFound: bool(v.orderFound),
        ownershipVerified: bool(v.ownershipVerified),
        itemName: str(v.itemName),
        orderTotal: num(v.orderTotal),
        orderedAt: str(v.orderedAt),
        isFinalSale: bool(v.isFinalSale)
      }
    : null;

const parseClassificationResult = (v: unknown): ClassificationResult | null =>
  isRecord(v)
    ? {
        intent: str(v.intent),
        reason: str(v.reason),
        confidence: num(v.confidence),
        suspicious: bool(v.suspicious),
        conflicting: bool(v.conflicting),
        promptInjectionDetected: bool(v.promptInjectionDetected),
        extractedFacts: strings(v.extractedFacts)
      }
    : null;

const parseClassification = (v: unknown): ClassificationAudit | null =>
  isRecord(v)
    ? {
        status: status(v.status),
        provider: str(v.provider),
        failureKind: str(v.failureKind),
        durationMs: num(v.durationMs),
        result: parseClassificationResult(v.result)
      }
    : null;

const parseAuditEvent = (v: unknown): AuditEvent | null => {
  if (!isRecord(v) || typeof v.type !== 'string') return null;
  const data: Record<string, AuditValue> = {};
  if (isRecord(v.data)) {
    for (const [key, value] of Object.entries(v.data)) {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) data[key] = value as AuditValue;
    }
  }
  return { type: v.type, at: str(v.at), data };
};

export const parseRefundDetail: Parser<RefundDetail> = (v) => {
  if (!isRecord(v) || typeof v.requestId !== 'string' || !isRecord(v.outcome) || !isDecision(v.outcome.decision)) return null;
  const request = isRecord(v.request) ? v.request : {};
  const outcome = v.outcome;
  return {
    requestId: v.requestId,
    createdAt: str(v.createdAt),
    request: { customerId: str(request.customerId), orderNumber: str(request.orderNumber), message: str(request.message) },
    facts: parseFacts(v.facts),
    classification: parseClassification(v.classification),
    outcome: {
      decision: outcome.decision as RefundDecision,
      reasonCode: str(outcome.reasonCode),
      humanReviewRequired: bool(outcome.humanReviewRequired),
      explanation: str(outcome.explanation),
      matchedRules: strings(outcome.matchedRules),
      decidedBy: str(outcome.decidedBy),
      amount: num(outcome.amount)
    },
    auditEvents: Array.isArray(v.auditEvents)
      ? v.auditEvents.map(parseAuditEvent).filter((e): e is AuditEvent => e !== null)
      : []
  };
};

// ---------- endpoints ----------

/** Transient failures that are safe to retry once, because the retry carries the same idempotency key. */
const isTransient = (error: unknown) =>
  error instanceof ApiError && (error.kind === 'network' || (error.kind === 'http' && [502, 503, 504].includes(error.status ?? 0)));

export interface SubmitOptions {
  signal?: AbortSignal;
  retryDelayMs?: number;
}

export const api = {
  customers: (signal?: AbortSignal) => request('/customers', listOf(parseCustomer), { signal }),

  orders: (customerId: string, signal?: AbortSignal) =>
    request(`/customers/${encodeURIComponent(customerId)}/orders`, listOf(parseOrder), { signal }),

  /**
   * Submits one logical refund request. The idempotency key is supplied by the caller
   * and reused for the single automatic retry, so a retry can never create a second request.
   */
  async submitRefund(payload: RefundRequestPayload, idempotencyKey: string, options: SubmitOptions = {}): Promise<RefundResult> {
    const send = () =>
      request('/refunds', parseRefundResult, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Idempotency-Key': idempotencyKey },
        signal: options.signal
      });
    try {
      return await send();
    } catch (error) {
      if (!isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 600));
      return send();
    }
  },

  /** Support dashboard list. Filtering is done by the server. */
  refunds: (query: RefundListQuery = {}, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (query.decision) params.set('decision', query.decision);
    if (query.limit) params.set('limit', String(query.limit));
    const qs = params.toString();
    return request(`/refunds${qs ? `?${qs}` : ''}`, parseRefundPage, { signal });
  },

  /** Support dashboard audit detail for one request. */
  refund: (requestId: string, signal?: AbortSignal) =>
    request(`/refunds/${encodeURIComponent(requestId)}`, parseRefundDetail, { signal })
};
