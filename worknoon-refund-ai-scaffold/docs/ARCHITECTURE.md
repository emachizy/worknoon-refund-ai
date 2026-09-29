# Architecture

```text
React/Vite customer + admin UI
              |
              v
        Express REST API  -- Zod request validation (400 on malformed input)
              |
              v
     Refund workflow (services/refundWorkflow.ts)
       1. load customer + order from MongoDB (authoritative facts)
       2. verify ownership -----------------------------+
       3. classify message (AI, only if ownership ok)   | invalid relationship:
          |                    |                        | classification SKIPPED
          | ok                 | ClassificationError    |
          v                    v                        v
   Deterministic Policy    ESCALATED               Deterministic Policy
   Engine                  AI_CLASSIFICATION_      Engine (denies on
   (APPROVED/DENIED/       UNAVAILABLE             relationship rules)
    ESCALATED)             (decided by workflow)
          |                    |                        |
          +--------------------+------------------------+
                               v
            persist ONE RefundRequest (facts, classification,
            decision, rule trace, audit events) -> MongoDB
                               v
            customer response  |  admin list / detail endpoints
```

## Trust boundaries
- Customer input: untrusted. It is validated for shape, stored verbatim for audit, and never used as a business fact.
- LLM output: untrusted until schema validation. Even after validation it is only a set of signals: it can block automatic approval, never grant it on its own.
- LLM request: contains only the fixed system prompt and the delimited customer message, with no customer or order records.
- Database facts (ownership, order total, order date, final-sale flag): authoritative. They are snapshotted onto each refund record.
- Refund policy code: authoritative for eligibility.
- Customer-facing explanation: static text chosen by reason code (presentation only).

## Refund request lifecycle (`POST /api/refunds`)
1. **Validate** the body with Zod (`validators/refund.validator.ts`).
   - `customerId` must be a well-formed 24-hex ObjectId.
   - `orderNumber` is 3 to 40 characters from `[A-Za-z0-9-]`.
   - `message` is 5 to 2000 characters after trimming.
   - An optional `Idempotency-Key` header is also validated.
   - Failures return **400** and **nothing is persisted**: a malformed payload is not a refund attempt.
2. **Idempotency.** If an `Idempotency-Key` was sent and a record with that key exists, return it with status 200 and the header `Idempotent-Replayed: true`. The workflow does not run again. The same key with a different payload returns **409**.
3. **Load facts.** The customer is loaded by id and the order by order number, both from MongoDB.
4. **Verify ownership.** The order's `customerId` must equal the requesting customer's id.
5. **Classify.** This step runs only when ownership is verified. For a missing customer or order, or a mismatch, the message is not sent to the AI (`classification.status = SKIPPED`), because the outcome is a fact-based denial either way.
6. **Decide.**
   - Classification succeeded or was skipped: `evaluateRefundPolicy()` decides (`decidedBy: POLICY_ENGINE`).
   - Classification failed: the **workflow** escalates with `AI_CLASSIFICATION_UNAVAILABLE` (`decidedBy: WORKFLOW`). This is never an approval or a denial.
7. **Persist** exactly one `RefundRequest` document in a single insert.
8. **Respond** with status 201 and the customer response contract.

### Why AI failure is an orchestration decision, not a policy rule
The policy engine answers "does this request qualify under refund policy, given these facts and signals?". An AI outage is not a fact about the order or the request. It means the workflow lacks an input it needs. Putting an `AI_UNAVAILABLE` rule into the engine would make a pure business-rule function model infrastructure state, and would let an infrastructure problem masquerade as a policy result. So the workflow owns this case and records `decidedBy: WORKFLOW`, and the policy engine and its tests stay unchanged.

Because an outage must not cause a denial either, a final-sale or expired order is **escalated**, not denied, when classification fails. A human reviewer will then deny it on the facts. The exception is an invalid customer/order relationship: classification never runs in that case, so an outage cannot affect it.

## Persistence and audit model (`models/RefundRequest.ts`)
One document per attempt, written once:

| Section | Contents | Answers |
| --- | --- | --- |
| Request | `customerId`, `orderNumber` (as submitted), `message` (stored once) | Who asked, which order, what they said |
| `facts` | Snapshot at decision time: `evaluatedAt`, customer found and name, order found, owner id, `ownershipVerified`, item, total, order date, final-sale | Which authoritative facts were used |
| `orderId`, `amount` | Resolved order and its total (null if the order was not found) | Refund amount, from the database only |
| `classification` | `status` (`SUCCEEDED` / `FAILED` / `SKIPPED`), `provider`, `failureKind`, `durationMs`, validated `result` | What the classifier concluded, or why it didn't |
| Outcome | `decision`, `reasonCode`, `humanReviewRequired`, `explanation`, `matchedRules` (policy rule trace), `decidedBy` | The final result, why, and which layer decided |
| `auditEvents` | `REQUEST_RECEIVED`, `FACTS_LOADED`, `CLASSIFICATION_*`, `POLICY_EVALUATED` / `ESCALATED_WITHOUT_POLICY`, each with a timestamp and small structured data | The order in which things happened |
| Timestamps | `createdAt`, `updatedAt` | When |
| Internal | `idempotencyKey`, `requestFingerprint` (SHA-256 of the payload) | Never returned by the API |

**Never stored:** API keys, raw provider error messages, stack traces, prompts, or model reasoning. A classification failure is stored only as `{ status: FAILED, provider, failureKind, durationMs }`.

Indexes: `createdAt`, `decision + createdAt`, `customerId + createdAt`, and a unique partial index on `idempotencyKey` (only when a key was supplied).

## Customer response vs admin audit data
| | Customer (`POST /api/refunds`) | Admin (`GET /api/refunds`, `GET /api/refunds/:id`) |
| --- | --- | --- |
| Decision, human-review flag, customer-safe explanation | Yes | Yes |
| Reason code, policy rule trace, `decidedBy` | **No** | Yes (reason code in list and detail; trace and `decidedBy` in detail) |
| Security flags (prompt injection, suspicious) | **No** | Yes (detail, inside the classification result) |
| AI classification output | **No** | Yes (detail) |
| AI provider and failure kind | **No** (generic wording only) | Yes (detail) |
| Authoritative facts snapshot | No | Yes (detail) |
| Customer message | No (they wrote it) | Yes (detail) |
| Audit events | No | Yes (detail) |

Responses are built by explicit mappers (`services/refundViews.ts`), never by serialising the Mongo document.

## API
| Method and path | Purpose | Responses |
| --- | --- | --- |
| `POST /api/refunds` | Submit a refund attempt. Optional `Idempotency-Key` header. | 201 new record · 200 idempotent replay · 400 invalid payload/header · 409 key reused with different payload |
| `GET /api/refunds` | Admin list, newest first. Query: `decision`, `humanReviewRequired=true\|false`, `limit` (1 to 100, default 50). | 200 `{ items, limit }` · 400 invalid query |
| `GET /api/refunds/:id` | Admin audit detail | 200 · 400 malformed id · 404 |
| `GET /api/customers`, `GET /api/customers/:id/orders` | Demo data | 200 · 400 malformed id · 404 |
| `GET /api/health` | Liveness and DB status | 200 · 503 |

Customer response contract:
```ts
{ requestId: string; decision: 'APPROVED' | 'DENIED' | 'ESCALATED'; humanReviewRequired: boolean;
  explanation: string; createdAt: string }
```

### Customer-facing wording
`explanation` is static text chosen by reason code (`services/refundOutcome.ts`). It never reveals internal rules, AI output, vendors, or detection:

| Outcome | Customer sees |
| --- | --- |
| Approved (damaged or incorrect item) | "Your refund request has been approved." |
| Final sale | "This order is not eligible for a refund under the refund policy." |
| Outside window | "This order is outside the 30-day refund window." |
| Unknown customer/order, or someone else's order | "We could not verify this order for your account." (identical, so order existence isn't revealed) |
| **Every** escalation (high value, unclear reason, prompt injection, suspicious, AI unavailable) | "Your request requires manual review. Our support team will review it." |

All escalations share one sentence on purpose. A customer probing the system cannot tell whether a message triggered injection or fraud detection or merely needed review. The stored record keeps the precise reason code for staff.

### Request validation (400) vs business denial (DENIED)
- **400:** the payload cannot identify a refund attempt. Examples: missing fields, malformed JSON, a customer id that is not an ObjectId, or an operator object instead of a string. Nothing is persisted.
- **DENIED:** a well-formed attempt that fails policy. Examples: an unknown customer id, an unknown order number, or an order owned by someone else. It is persisted with a reason code, because such attempts may be mistakes or probing and should be auditable.

## Logging
Each workflow run emits one structured `refund request decided` log with `requestId`, `decision`, `reasonCode`, `decidedBy`, `classificationStatus`, `classificationProvider`, `failureKind`, `humanReviewRequired` and `durationMs`. The AI layer logs provider diagnostics (status, error code, request id), never messages, keys or prompts. Customer messages are not logged.

## Duplicate submissions
- **With a key.** When the client sends an `Idempotency-Key`, a double submission returns the original record. Concurrent duplicates are resolved by the unique index: the losing insert returns the winner's record.
- **Without a key.** Each submission is a separate attempt. The current web UI does not send a key yet (Phase 5 should generate one per form submission and disable the button while it is in flight).

## AI classification layer
`apps/api/src/services/ai/`:
- `classifier.ts`: `RefundClassifier` interface, `ClassificationError` (typed failure), and the Zod output contract.
- `openaiClassifier.ts`: OpenAI Responses API with strict JSON-schema output, explicit timeout, no SDK retries, and one retry on invalid output.
- `mockClassifier.ts`: deterministic keyword fallback.
- `injectionDetector.ts`: conservative deterministic prompt-injection patterns.
- `index.ts`: provider factory, plus `withDeterministicSafeguards`, which re-validates output and ORs in the deterministic flags.

The classifier is injected into the app (`createApp({ classifier })`), so tests substitute scripted classifiers without network calls. See `docs/AI_CLASSIFICATION.md`.
