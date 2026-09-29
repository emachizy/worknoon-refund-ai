import { ApiError } from '../../api/client';

export type LoadContext = 'customers' | 'orders';

/** Customer-friendly error text. Never includes server messages, status codes, or technical detail. */
export function loadErrorMessage(error: unknown, context: LoadContext): string {
  const what = context === 'customers' ? 'the customer list' : "this customer's orders";
  if (error instanceof ApiError && error.kind === 'network') {
    return `We couldn't load ${what} because the service is unreachable. Check your connection and try again.`;
  }
  return `We couldn't load ${what} right now. Please try again.`;
}

export function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') return "We couldn't reach the refund service. Check your connection and try again.";
    if (error.kind === 'invalid_response') return 'We received an unexpected response. Please try again in a moment.';
    if (error.status === 400) return "Some details in your request couldn't be accepted. Please check them and try again.";
    if (error.status === 409) return 'This request changed while it was being sent. Please submit it again.';
    if (error.status === 429) return "You've sent several requests in a short time. Please wait a minute and try again.";
  }
  return "Something went wrong on our side and your request wasn't submitted. Please try again in a moment.";
}
