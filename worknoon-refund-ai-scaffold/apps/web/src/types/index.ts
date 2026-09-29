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

/** Row of the admin list endpoint (GET /api/refunds), used by the support dashboard only. */
export interface RefundSummary {
  requestId: string;
  createdAt: string | null;
  customerName: string | null;
  orderNumber: string;
  amount: number | null;
  decision: RefundDecision;
  reasonCode: string;
  humanReviewRequired: boolean;
  explanation: string;
  classificationStatus: string | null;
}
