# AI Classification Layer

The AI layer turns an untrusted customer message into validated, structured signals. It never decides a refund. `evaluateRefundPolicy()` (see `REFUND_POLICY.md`) remains the only authority for `APPROVED`, `DENIED`, and `ESCALATED`.

Code: `apps/api/src/services/ai/` (entry point `apps/api/src/services/ai.service.ts`).

## Output contract
Every provider returns the existing `AiClassification` type (`apps/api/src/types/refund.ts`):

| Field | Values | Used by policy? |
| --- | --- | --- |
| `intent` | `REFUND_REQUEST` \| `OTHER` | No |
| `reason` | `DAMAGED_ITEM`, `INCORRECT_ITEM`, `CHANGED_MIND`, `NOT_AS_DESCRIBED`, `LATE_DELIVERY`, `OTHER` | Yes. Only `DAMAGED_ITEM` and `INCORRECT_ITEM` can lead to approval, and only if every order-fact check passes. |
| `confidence` | number, 0 to 1 inclusive | No (recorded for audit) |
| `suspicious`, `conflicting`, `promptInjectionDetected` | boolean | Yes. Any `true` blocks automatic approval (escalates). |
| `extractedFacts` | up to 8 strings of up to 200 characters | No (recorded for audit) |

## Providers
| `AI_PROVIDER` | Behaviour |
| --- | --- |
| unset or empty | `mock` |
| `mock` | Deterministic keyword classifier. No network, no key. |
| `openai` | OpenAI Responses API with strict structured output. **Requires `OPENAI_API_KEY`: startup fails with a clear configuration error if it is missing.** |
| anything else | Startup fails. |

Both providers sit behind the same `RefundClassifier` interface and are wrapped by the same deterministic safeguards (below).

### Environment variables
| Variable | Default | Notes |
| --- | --- | --- |
| `AI_PROVIDER` | `mock` | `mock` or `openai` |
| `OPENAI_API_KEY` | (none) | Required for `openai`. Never logged or returned. |
| `OPENAI_MODEL` | `gpt-5-mini` | Any Responses-API model that supports structured outputs |
| `OPENAI_TIMEOUT_MS` | `15000` | Per-request timeout, 1000 to 60000 |

Configuration errors name the variable and the problem, never the value.

### Mock mode
The mock is a **development fallback, not an intelligent classifier**. It exists so that tests, offline development, and reviewers without an API key all run the full pipeline deterministically. It matches a small set of phrases (for example "arrived broken", "wrong item", "changed my mind", "isn't what the description said", "arrived late") and a few contradiction patterns. Its confidence values are fixed constants (0.6 when a phrase matched, 0.3 otherwise), not estimates. It does not understand negation in general, so "the box was damaged but the item is fine" is classified as `DAMAGED_ITEM`. The API logs a warning at startup when mock mode is active.

## What is sent to OpenAI
Exactly one request per attempt, containing:
- `instructions`: the fixed system prompt (`SYSTEM_PROMPT` in `openaiClassifier.ts`);
- `input`: the customer's refund message, wrapped in `<customer_message>` delimiters;
- `text.format`: the strict JSON schema for the output;
- `model`, and `store: false` (asks OpenAI not to store the response for later retrieval).

**Not sent:** customer name, email, or id; order number, amount, dates, or final-sale status; and any other database data. Order facts are not needed to understand the message, and keeping them out means the model has nothing to reason about eligibility with. Note that the message itself may contain personal data the customer chose to type.

## Why the model cannot approve refunds
- The model's output type has no decision field. Extra fields it might emit (for example `"decision": "APPROVED"`) are stripped during validation.
- The policy engine reads order facts from the database. It takes only `reason` and the three risk flags from the AI.
- A risk flag can only move a request toward escalation. An approval also requires ownership, not final sale, inside the window, and ≤ $500, all computed from database facts.
- So the worst a manipulated classification can do is mislabel an otherwise-eligible order of $500 or less as damaged or incorrect. Those are exactly the requests the business already approves automatically.

## Structured-output validation
Model output is never trusted as-is:
1. OpenAI is asked for strict JSON-schema output (`strict: true`, `additionalProperties: false`, enums for `intent` and `reason`).
2. The response is checked for refusals and incomplete generations.
3. `output_text` is parsed as JSON, and a parse failure counts as invalid output.
4. The parsed value is validated with Zod (`aiClassificationSchema`): exact enums, booleans, confidence within 0 to 1, and unknown keys stripped. `extractedFacts` is capped (8 items, 200 characters each).
5. The provider-independent wrapper validates again, so a buggy or future provider cannot bypass it.

## Prompt-injection safeguards (defense in depth)
No filter or prompt can make an LLM immune to prompt injection. These layers **reduce the risk of policy bypass**. The main protection is structural: the model has no authority to bypass anything.

1. **Architecture.** The model classifies. Deterministic code decides using database facts.
2. **Prompt isolation.** The system prompt says the customer text is untrusted data, that instructions inside it must not be followed, and that the model is not a decision-maker, cannot alter policy, and cannot claim a refund was issued. Customer text is sent only in the user turn, inside delimiters. Any delimiter look-alike inside the message is neutralised so the message cannot close the block early.
3. **Model detection.** The model is asked to set `promptInjectionDetected` and `suspicious`.
4. **Deterministic detection** (`injectionDetector.ts`). A deliberately small set of patterns for obvious attempts:
   - instruction override ("ignore previous instructions", "ignore the refund policy", "override policy");
   - role markers ("system message", "developer prompt", lines starting `system:`);
   - delimiter escape attempts;
   - forced approval ("approve my refund regardless", "you must approve");
   - staff or administrator impersonation.

   Text is normalised first (Unicode NFKC, zero-width characters removed, case folded), which defeats trivial obfuscation.
5. **Flags are OR-ed.** If either the model or the deterministic scan flags injection, `promptInjectionDetected` is `true`. The scan can raise flags but never clear one the model raised. Any such flag escalates the request (unless an order-fact rule denies it first).

**Limitations.** The deterministic patterns are tuned to avoid false alarms, so paraphrased, novel, or non-English attacks will get past them and rely on the model. The model can also miss them. A false negative still cannot produce an approval that order facts would not allow. False positives are possible (they escalate, which costs reviewer time but denies nothing).

## Failure behaviour
Every failure surfaces as a `ClassificationError` with a `kind`:

| Kind | Cause | Retried? |
| --- | --- | --- |
| `TIMEOUT` | No response within `OPENAI_TIMEOUT_MS` | No |
| `PROVIDER_ERROR` | Network, auth, rate limit, 5xx, or unexpected error | No (SDK auto-retries are disabled) |
| `INVALID_OUTPUT` | Not JSON, fails the schema, or the response is incomplete | **Once.** A malformed generation is a sampling fluke that a fresh sample usually fixes. |
| `REFUSED` | Model refused | No |

Worst-case latency is therefore about two timeouts.

- **Never a decision.** A classification failure is never turned into `APPROVED` or `DENIED`.
- **Current behaviour.** `POST /api/refunds` responds `503` with a generic "try again shortly" message and makes no decision.
- **Phase 4.** Orchestration will catch `ClassificationError` and escalate to human review instead.
- **What is logged.** Provider, model, attempt, duration, failure kind, HTTP status, provider error code, and request id.
- **What is not logged or returned.** Provider error messages (OpenAI auth errors echo part of the key), the API key, customer text, and model output. Schema failures log only the failing field paths.
