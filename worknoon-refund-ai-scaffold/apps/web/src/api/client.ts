import type { Customer, Order, RefundResult } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

export const api = {
  customers: () => json<Customer[]>('/customers'),
  orders: (customerId: string) => json<Order[]>(`/customers/${customerId}/orders`),
  // The list endpoint returns a pagination-ready envelope: { items, limit }.
  refunds: () => json<{ items: RefundResult[] }>('/refunds').then((page) => page.items),
  createRefund: (payload: { customerId: string; orderNumber: string; message: string }) =>
    json<RefundResult>('/refunds', { method: 'POST', body: JSON.stringify(payload) })
};
