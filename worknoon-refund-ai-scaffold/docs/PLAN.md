# Build Plan

## Phase 0 — Scaffold and run
Goal: app boots locally and via Docker.
- Install dependencies.
- Copy `.env.example` to `.env`.
- Confirm `docker compose up --build` starts Mongo, API and frontend.
- Confirm `/api/health` responds.

## Phase 1 — Data model and seed data
Goal: synthetic CRM/order database with ~15 customers.
- Customer model.
- Order model with items, total, order date, final-sale flag/status.
- RefundRequest model for audit history.
- Seed exactly 15 realistic customers with 1–3 orders each.
- Seed scenarios covering every policy branch.

Acceptance criteria:
- `/api/customers/:id/orders` returns orders.
- Seed script is safe to run repeatedly.

## Phase 2 — Deterministic policy engine
Goal: refund decisions are explainable without AI.
- Implement policy service as pure functions.
- Use a 30-day refund window.
- Final-sale => denied.
- > $500 => escalated.
- Damaged/incorrect => approved when no stronger deny/escalate rule applies.
- Suspicious/conflicting => escalated.
- Add unit tests for precedence and boundaries.

Acceptance criteria:
- Policy tests pass without any API key or database.

## Phase 3 — AI classification layer
Goal: AI converts messy customer language into validated structured intent.
Return shape:
- intent
- reason category
- confidence
- suspicious/conflicting flags
- promptInjectionDetected
- concise extracted facts

Implementation requirements:
- Provider abstraction (`AiProvider`).
- OpenAI implementation first.
- Zod parse/validation.
- Graceful fallback classification if provider unavailable.
- AI cannot produce final eligibility decision.

## Phase 4 — Refund orchestration API
Goal: end-to-end backend request works.
Endpoint: `POST /api/refunds`
Input:
- customerId/email
- orderNumber
- message

Backend:
1. Validate input.
2. Load customer/order and verify ownership.
3. Classify message with AI.
4. Run deterministic policy engine.
5. Store RefundRequest + audit details.
6. Generate safe human-readable explanation.
7. Return decision.

Also implement:
- `GET /api/refunds`
- `GET /api/refunds/:id`
- optional `PATCH /api/refunds/:id/review` for human resolution.

## Phase 5 — Customer UI
Goal: polished but minimal customer workflow.
- Customer selector for demo.
- Order selector/order number.
- Refund message textarea/chat-like flow.
- Loading/error state.
- Decision card with Approved/Denied/Escalated.
- Explanation and ticket/reference ID.

## Phase 6 — Admin/support dashboard
Goal: demonstrate auditability/product thinking.
- KPI cards: total, approved, denied, escalated.
- Refund table with customer, order, amount, decision, date.
- Detail drawer/page with:
  - original message
  - AI classification
  - matched policy rules
  - audit timeline
  - human-review indicator

## Phase 7 — Security and failure paths
- Helmet.
- Rate limiting.
- CORS allowlist.
- Input size limits.
- Prompt-injection detection + policy isolation.
- Never return secrets or raw provider errors.
- AI timeout and fallback.
- Validate IDs/order ownership.

## Phase 8 — Test, documentation, demo
- Policy unit tests.
- At least one refund integration test.
- README architecture diagram.
- Screenshots optional.
- 3–5 minute demo script.
- Verify clean clone + `docker compose up --build`.
