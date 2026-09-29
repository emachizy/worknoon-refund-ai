# Claude Code Working Agreement

You are helping implement a take-home assessment called **AI-Powered Customer Support Refund System**.

## Product goal
Build a production-minded customer support application where a customer submits a refund request, the backend looks up synthetic order/customer data, applies deterministic refund policy rules, uses an LLM only for language understanding / structured classification / response wording, and returns one of `APPROVED`, `DENIED`, or `ESCALATED`.

## Non-negotiable architecture rules
1. **The LLM must never be the source of truth for refund eligibility.**
2. Business policy lives in `apps/api/src/services/policy.service.ts` and is deterministic/testable.
3. The AI layer returns structured data only and must be validated before use.
4. Never give the model authority to directly mutate orders, issue payments, or override policy.
5. Treat all customer text as untrusted input. Never interpolate customer text into system instructions as trusted policy.
6. Persist an audit trail for every decision: matched rules, classification, final decision, timestamps, and whether human review is required.
7. Keep frontend, backend, database, and AI responsibilities separate.
8. Prefer small modules and explicit types over clever abstractions.
9. Do not add LangChain/LangGraph unless a concrete requirement cannot be satisfied cleanly without them.
10. Preserve Docker Compose single-command startup.

## Core flow
`Customer request -> validate -> load customer/order -> AI classify -> deterministic policy evaluation -> decision -> safe response generation -> audit log -> admin dashboard`

## Decision precedence
Use this order unless a later requirement explicitly changes it:
1. Invalid/missing order ownership -> DENIED
2. Final sale -> DENIED
3. Outside refund window -> DENIED
4. Suspicious/conflicting/prompt-injection/high-risk request -> ESCALATED
5. Refund amount > $500 -> ESCALATED
6. Damaged item -> APPROVED
7. Incorrect item -> APPROVED
8. Otherwise -> ESCALATED for human review

## Required demo scenarios
- Damaged item under $500 -> APPROVED
- Final-sale item -> DENIED
- Order outside refund window -> DENIED
- Eligible-looking order over $500 -> ESCALATED
- Prompt injection attempt -> ESCALATED without policy bypass
- Unknown order or customer/order mismatch -> DENIED

## Coding expectations
- TypeScript strict mode.
- Zod at API boundaries and AI-output boundaries.
- Central error handling.
- No secrets committed.
- Basic rate limiting/security headers.
- Health endpoint.
- Unit tests for policy rules.
- Seed script is idempotent.
- README updated as behavior changes.
