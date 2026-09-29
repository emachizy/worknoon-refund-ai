export interface Customer { _id: string; name: string; email: string; }
export interface Order { _id: string; orderNumber: string; itemName: string; total: number; orderedAt: string; isFinalSale: boolean; }
export interface RefundResult { _id?: string; requestId?: string; reasonCode?: string; customerName?: string | null; decision: 'APPROVED' | 'DENIED' | 'ESCALATED'; explanation: string; humanReviewRequired: boolean; matchedRules?: string[]; orderNumber?: string; amount?: number | null; createdAt?: string; }
