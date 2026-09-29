# Architecture

```text
React/Vite customer + admin UI
              |
              v
        Express REST API
              |
     +--------+---------+
     |                  |
     v                  v
MongoDB            AI Classifier
     |          (OpenAI | mock) + deterministic
     |           injection scan, Zod-validated
     |                  |
     +--------+---------+
              v
      Refund Orchestrator
              |
              v
    Deterministic Policy Engine
              |
      +-------+--------+
      |       |        |
 APPROVED   DENIED  ESCALATED
              |
              v
          Audit Log
```

## Trust boundaries
- Customer input: untrusted.
- LLM output: untrusted until schema validation. Even after validation it is only a set of signals: it can block automatic approval, never grant it on its own.
- LLM request: contains only the fixed system prompt and the delimited customer message, with no customer or order records.
- Database order facts: authoritative for the assessment.
- Refund policy code: authoritative for eligibility.
- Generated customer response: presentation only.

## AI classification layer
`apps/api/src/services/ai/`:
- `classifier.ts`: `RefundClassifier` interface, `ClassificationError` (typed failure), and the Zod output contract.
- `openaiClassifier.ts`: OpenAI Responses API with strict JSON-schema output, explicit timeout, no SDK retries, and one retry on invalid output.
- `mockClassifier.ts`: deterministic keyword fallback.
- `injectionDetector.ts`: conservative deterministic prompt-injection patterns.
- `index.ts`: provider factory, plus `withDeterministicSafeguards`, which re-validates output and ORs in the deterministic flags.

See `docs/AI_CLASSIFICATION.md`.
