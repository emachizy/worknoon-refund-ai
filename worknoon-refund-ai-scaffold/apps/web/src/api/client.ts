import type { Customer, Order, RefundDecision, RefundRequestPayload, RefundResult, RefundSummary } from '../types';

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

const parseRefundPage: Parser<RefundSummary[]> = (v) =>
  isRecord(v) && Array.isArray(v.items) ? (v.items as RefundSummary[]) : null;

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

  /** Support dashboard list (admin). */
  refunds: () => request('/refunds', parseRefundPage)
};
