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
     |              (OpenAI)
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
- LLM output: untrusted until schema validation.
- Database order facts: authoritative for the assessment.
- Refund policy code: authoritative for eligibility.
- Generated customer response: presentation only.
