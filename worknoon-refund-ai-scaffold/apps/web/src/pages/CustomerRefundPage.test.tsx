import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerRefundPage } from './CustomerRefundPage';

// The real page and API client are exercised end to end; only fetch is replaced.

const API = 'http://localhost:4000/api';

const CUSTOMERS = [
  { _id: 'c1', name: 'Ava Johnson', email: 'ava@example.com', tier: 'premium' },
  { _id: 'c2', name: 'Liam Carter', email: 'liam@example.com', tier: 'standard' }
];
const ORDERS: Record<string, unknown[]> = {
  c1: [
    { _id: 'o1', orderNumber: 'ORD-1001', itemName: 'Wireless Headphones', total: 89, currency: 'USD', orderedAt: '2026-06-10T12:00:00.000Z', isFinalSale: false, customerId: 'c1' },
    { _id: 'o2', orderNumber: 'ORD-1006', itemName: 'Clearance Jacket', total: 149, currency: 'USD', orderedAt: '2026-06-07T12:00:00.000Z', isFinalSale: true, customerId: 'c1' }
  ],
  c2: [{ _id: 'o3', orderNumber: 'ORD-2001', itemName: 'Running Shoes', total: 129, currency: 'USD', orderedAt: '2026-06-05T12:00:00.000Z', isFinalSale: false }]
};

const result = (decision: string, explanation: string, extra: Record<string, unknown> = {}) => ({
  requestId: '6abbaad89d5b4155ebd09d31',
  decision,
  humanReviewRequired: decision === 'ESCALATED',
  explanation,
  createdAt: '2026-06-15T12:00:00.000Z',
  ...extra
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Post {
  body: Record<string, unknown>;
  key: string | null;
}

/** Routes fetch calls. `refund` decides each POST /refunds response; customers/orders can be overridden. */
function mockApi(options: {
  refund?: (post: Post, index: number) => Response | Promise<Response>;
  customers?: () => Response | Promise<Response>;
  orders?: (customerId: string) => Response | Promise<Response>;
} = {}) {
  const posts: Post[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === `${API}/customers`) return options.customers ? options.customers() : json(CUSTOMERS);
    const orders = url.match(/\/customers\/([^/]+)\/orders$/);
    if (orders) return options.orders ? options.orders(orders[1]!) : json(ORDERS[orders[1]!] ?? []);
    if (url === `${API}/refunds` && init.method === 'POST') {
      const headers = new Headers(init.headers);
      const post = { body: JSON.parse(String(init.body)), key: headers.get('Idempotency-Key') };
      posts.push(post);
      return options.refund ? options.refund(post, posts.length - 1) : json(result('APPROVED', 'Your refund request has been approved.'), 201);
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, posts };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const setup = () => {
  const user = userEvent.setup();
  render(<CustomerRefundPage submissionOptions={{ retryDelayMs: 0 }} />);
  return user;
};

async function chooseCustomer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const select = await screen.findByLabelText('Customer');
  await waitFor(() => expect(select).toBeEnabled());
  await user.selectOptions(select, screen.getByRole('option', { name }));
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, message = 'My headphones arrived cracked.') {
  await chooseCustomer(user, 'Ava Johnson');
  await user.click(await screen.findByRole('radio', { name: /Wireless Headphones/ }));
  await user.type(screen.getByLabelText('Tell us what happened'), message);
  await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
}

// Minimal matchers without pulling in jest-dom.
expect.extend({
  toBeEnabled(el: HTMLElement) {
    const pass = !(el as HTMLButtonElement).disabled;
    return { pass, message: () => `expected element to be ${pass ? 'disabled' : 'enabled'}` };
  },
  toBeDisabled(el: HTMLElement) {
    const pass = (el as HTMLButtonElement).disabled;
    return { pass, message: () => `expected element to be ${pass ? 'enabled' : 'disabled'}` };
  }
});
declare module 'vitest' {
  interface Assertion {
    toBeEnabled(): void;
    toBeDisabled(): void;
  }
}

beforeEach(() => {
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    (() => {
      let n = 0;
      return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
    })()
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('loading customers and orders', () => {
  it('1. loads and lists customers by name', async () => {
    mockApi();
    setup();
    expect(screen.getByRole('option', { name: 'Loading customers…' })).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Ava Johnson' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Liam Carter' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('c1'); // no database ids on screen
  });

  it("2. selecting a customer loads that customer's orders with useful details", async () => {
    const { fetchMock } = mockApi();
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');

    expect(screen.getByText(/ava@example.com/)).toBeTruthy();
    const headphones = await screen.findByRole('radio', { name: /Wireless Headphones/ });
    expect(fetchMock).toHaveBeenCalledWith(`${API}/customers/c1/orders`, expect.anything());
    const card = headphones.closest('label')!;
    expect(within(card).getByText(/ORD-1001/)).toBeTruthy();
    expect(within(card).getByText('$89.00')).toBeTruthy();
    expect(within(card).getByText(/Ordered/)).toBeTruthy();
    const jacket = screen.getByRole('radio', { name: /Clearance Jacket/ }).closest('label')!;
    expect(within(jacket).getByText('Final sale')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /Running Shoes/ })).toBeNull();
  });

  it('3. switching customer clears the selected order and shows only the new orders', async () => {
    mockApi();
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    await user.click(await screen.findByRole('radio', { name: /Wireless Headphones/ }));

    await user.selectOptions(screen.getByLabelText('Customer'), screen.getByRole('option', { name: 'Liam Carter' }));
    const shoes = await screen.findByRole('radio', { name: /Running Shoes/ });
    expect((shoes as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('radio', { name: /Wireless Headphones/ })).toBeNull();
    expect(screen.queryByText('✓ Selected')).toBeNull();

    // The previous customer's order must not be submitted for the new customer.
    await user.type(screen.getByLabelText('Tell us what happened'), 'It arrived broken.');
    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    expect(screen.getByText('Choose the order you want a refund for.')).toBeTruthy();
  });

  it("3b. a slow response for the previous customer never replaces the new customer's orders", async () => {
    const slow = deferred<Response>();
    mockApi({ orders: (id) => (id === 'c1' ? slow.promise : json(ORDERS[id])) });
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    await user.selectOptions(screen.getByLabelText('Customer'), screen.getByRole('option', { name: 'Liam Carter' }));
    await screen.findByRole('radio', { name: /Running Shoes/ });

    slow.resolve(json(ORDERS.c1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('radio', { name: /Wireless Headphones/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /Running Shoes/ })).toBeTruthy();
  });

  it('4. an order can be selected and the selection is shown in text, not just colour', async () => {
    mockApi();
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    const radio = await screen.findByRole('radio', { name: /Wireless Headphones/ });
    await user.click(radio);
    expect((radio as HTMLInputElement).checked).toBe(true);
    expect(within(radio.closest('label')!).getByText('✓ Selected')).toBeTruthy();
  });

  it('customer-loading failure shows a friendly error and retries', async () => {
    let calls = 0;
    mockApi({ customers: () => (++calls === 1 ? json({ message: 'MongoServerError: connection refused' }, 500) : json(CUSTOMERS)) });
    const user = setup();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("We couldn't load the customer list");
    expect(document.body.textContent).not.toMatch(/MongoServerError|500/);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('option', { name: 'Ava Johnson' })).toBeTruthy();
  });

  it('order-loading failure shows a friendly error and retries', async () => {
    let calls = 0;
    mockApi({ orders: (id) => (++calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : json(ORDERS[id])) });
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("couldn't load this customer's orders");
    expect(alert.textContent).not.toContain('Failed to fetch');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radio', { name: /Wireless Headphones/ })).toBeTruthy();
  });
});

describe('validation and submission', () => {
  it('5. an empty or too-short message cannot be submitted', async () => {
    const { posts } = mockApi();
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    await user.click(await screen.findByRole('radio', { name: /Wireless Headphones/ }));

    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    expect(screen.getByText('Tell us what happened with your order.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Tell us what happened'));

    await user.type(screen.getByLabelText('Tell us what happened'), '   hi  ');
    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    expect(screen.getByText(/at least 5 characters/)).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it('5b. submitting without an order asks for one', async () => {
    const { posts } = mockApi();
    const user = setup();
    await chooseCustomer(user, 'Ava Johnson');
    await screen.findByRole('radio', { name: /Wireless Headphones/ });
    await user.type(screen.getByLabelText('Tell us what happened'), 'It arrived broken.');
    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    expect(screen.getByText('Choose the order you want a refund for.')).toBeTruthy();
    expect(posts).toHaveLength(0);
  });

  it('6. the submit button is disabled while the request is in flight, and double clicks send one request', async () => {
    const pending = deferred<Response>();
    const { posts } = mockApi({ refund: () => pending.promise });
    const user = setup();
    await fillAndSubmit(user);

    const button = screen.getByRole('button', { name: 'Reviewing request…' });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.click(button);
    expect(posts).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Reviewing your request…' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bAI\b/);

    pending.resolve(json(result('APPROVED', 'Your refund request has been approved.'), 201));
    expect(await screen.findByRole('heading', { name: 'Refund approved' })).toBeTruthy();
  });

  it('7. sends the payload with an Idempotency-Key header', async () => {
    const { posts } = mockApi();
    const user = setup();
    await fillAndSubmit(user, '  My headphones arrived cracked.  ');
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts).toEqual([
      {
        body: { customerId: 'c1', orderNumber: 'ORD-1001', message: 'My headphones arrived cracked.' },
        key: '00000000-0000-4000-8000-000000000001'
      }
    ]);
  });

  it('7b. a transient network failure is retried automatically with the same key', async () => {
    const { posts } = mockApi({
      refund: (_post, i) => (i === 0 ? Promise.reject(new TypeError('Failed to fetch')) : json(result('APPROVED', 'ok'), 201))
    });
    const user = setup();
    await fillAndSubmit(user);
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts).toHaveLength(2);
    expect(posts[0]!.key).toBe(posts[1]!.key);
  });

  it('7c. retrying the same request after a failure reuses the key; changing the message uses a new key', async () => {
    const { posts } = mockApi({
      refund: (_post, i) => (i < 2 ? json({ message: 'boom' }, 500) : json(result('APPROVED', 'ok'), 201))
    });
    const user = setup();
    await fillAndSubmit(user);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('alert');
    expect(posts[1]!.key).toBe(posts[0]!.key);

    await user.type(screen.getByLabelText('Tell us what happened'), ' Also scratched.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts[2]!.key).not.toBe(posts[0]!.key);
  });

  it('7d. after a 409 conflict the next attempt uses a fresh key', async () => {
    const { posts } = mockApi({ refund: (_p, i) => (i === 0 ? json({ message: 'conflict' }, 409) : json(result('APPROVED', 'ok'), 201)) });
    const user = setup();
    await fillAndSubmit(user);
    expect((await screen.findByRole('alert')).textContent).toContain('Please submit it again');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });
});

describe('results', () => {
  it.each([
    ['APPROVED', 'Refund approved', 'Approved', 'Your refund request has been approved.'],
    ['DENIED', 'Refund not approved', 'Not approved', 'This order is not eligible for a refund under the refund policy.'],
    ['ESCALATED', 'Manual review required', 'In review', 'Your request requires manual review. Our support team will review it.']
  ])('8–10. %s renders its title, text badge, backend explanation and reference', async (decision, title, badge, explanation) => {
    mockApi({ refund: () => json(result(decision, explanation), 201) });
    const user = setup();
    await fillAndSubmit(user);

    const heading = await screen.findByRole('heading', { name: title });
    expect(document.activeElement).toBe(heading);
    const card = heading.closest('section')!;
    expect(within(card).getByText(badge)).toBeTruthy();
    expect(within(card).getByText(explanation)).toBeTruthy();
    expect(within(card).getByText('6abbaad89d5b4155ebd09d31')).toBeTruthy();
    expect(within(card).getByText('Reference')).toBeTruthy();
  });

  it('11. never displays reasonCode, matchedRules or other internals, even if a server sent them', async () => {
    mockApi({
      refund: () =>
        json(
          result('ESCALATED', 'Your request requires manual review. Our support team will review it.', {
            reasonCode: 'PROMPT_INJECTION_DETECTED',
            matchedRules: ['PROMPT_INJECTION_FLAG'],
            classification: { provider: 'openai', failureKind: 'TIMEOUT' }
          }),
          201
        )
    });
    const user = setup();
    await fillAndSubmit(user);
    await screen.findByRole('heading', { name: 'Manual review required' });
    expect(document.body.textContent).not.toMatch(/PROMPT_INJECTION|reasonCode|matchedRules|openai|TIMEOUT|classification/i);
  });

  it.each([
    ['server error', () => json({ message: 'Error: boom\n    at Object.<anonymous> (server.ts:1:1)' }, 500), 'Something went wrong on our side'],
    ['validation error', () => json({ message: 'Validation failed', issues: [{ path: 'message' }] }, 400), "couldn't be accepted"],
    ['rate limit', () => json({ message: 'Too many requests' }, 429), 'wait a minute'],
    ['malformed response', () => json({ decision: 'MAYBE' }, 201), 'unexpected response'],
    ['non-JSON response', () => new Response('<html>502 Bad Gateway</html>', { status: 200 }), 'unexpected response'],
    ['API unavailable', () => Promise.reject(new TypeError('Failed to fetch')), "couldn't reach the refund service"]
  ])('12. %s shows a safe, friendly error', async (_label, refund, expected) => {
    mockApi({ refund });
    const user = setup();
    await fillAndSubmit(user);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(expected);
    expect(document.body.textContent).not.toMatch(/Error:|at Object|server\.ts|Validation failed|Bad Gateway|Failed to fetch|<html>|\{/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('13. "Submit another request" keeps the customer, clears order/message/result, and uses a new key', async () => {
    const { posts } = mockApi();
    const user = setup();
    await fillAndSubmit(user);
    await user.click(await screen.findByRole('button', { name: 'Submit another request' }));

    expect((screen.getByLabelText('Customer') as HTMLSelectElement).value).toBe('c1');
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByLabelText('Tell us what happened') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('heading', { name: 'Your result' })).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: /Clearance Jacket/ }));
    await user.type(screen.getByLabelText('Tell us what happened'), 'The zip is broken.');
    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });

  it('13b. a new request gets a new key even when the order and message are identical', async () => {
    const { posts } = mockApi();
    const user = setup();
    await fillAndSubmit(user);
    await user.click(await screen.findByRole('button', { name: 'Submit another request' }));
    await user.click(screen.getByRole('radio', { name: /Wireless Headphones/ }));
    await user.type(screen.getByLabelText('Tell us what happened'), 'My headphones arrived cracked.');
    await user.click(screen.getByRole('button', { name: 'Submit refund request' }));
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(posts[1]!.body).toEqual(posts[0]!.body);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });

  it('the form is locked while a result is shown, so the same request cannot be re-sent by accident', async () => {
    mockApi();
    const user = setup();
    await fillAndSubmit(user);
    await screen.findByRole('heading', { name: 'Refund approved' });
    expect(screen.getByLabelText('Tell us what happened')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Submit refund request' })).toBeNull();
  });
});
