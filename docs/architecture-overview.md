# Architecture Overview

## Summary

The Enterprise Contract Risk Assistant is an Express + TypeScript backend and a React + Vite + TypeScript frontend. A contract (pasted text or an uploaded PDF/DOCX/TXT file) is pushed through a 5-node pipeline that extracts structured legal facts, scores risk across four dimensions, writes an executive summary, and emits a schema-validated JSON verdict with a deterministic recommendation. Every stage writes to an in-memory, hash-chained audit trail that a governance dashboard reads live — there is no separate "demo mode" with fake numbers; the dashboard reflects whatever has actually run in the process.

There is no database. All state — executions, review decisions, the audit trail, continuous-learning traces — lives in in-memory `Map`/array-backed stores for the lifetime of the Node process. This is a deliberate scope decision for a take-home-sized deliverable, not an oversight; see `assumptions-limitations-future-enhancements.md`.

## Component diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│           Frontend           │  HTTP  │                Backend                │
│  React + Vite + TypeScript   │◄──────►│         Express + TypeScript          │
│                               │        │                                      │
│  ContractInputPanel  (paste  │        │  routes/contract.route.ts            │
│    text or upload file)      │        │  routes/governance.route.ts          │
│  WorkflowCanvas (5-node      │        │  routes/continuous-learning.route.ts │
│    visual progress)          │        │                                      │
│  ResultPanel (review UI:     │        │  controllers/contract.controller.ts  │
│    edit metadata, accept/    │        │                                      │
│    reject risks, comment,    │        │  services/pipeline/                  │
│    final decision)           │        │    index.ts        orchestrator      │
│  pages/governance/*          │        │    node1-webhook.ts                  │
│    (Overview, Policies,      │        │    node2-input.ts                    │
│    Compliance, Audit, Fleet, │        │    node3-extractor.ts   (LLM)        │
│    SLO)                      │        │    node4-risk.ts        (LLM)        │
│  pages/continuous-learning/* │        │    node5-guardrail.ts   (LLM)        │
│                               │        │                                      │
│                               │        │  services/openai.ts                 │
│                               │        │    OpenRouter client + callJsonLLM() │
│                               │        │  services/text-extraction.ts         │
│                               │        │    pdf-parse / mammoth / raw text    │
│                               │        │  services/execution-store.ts         │
│                               │        │  services/review-store.ts            │
│                               │        │  services/governance-audit-store.ts  │
│                               │        │    hash-chained audit log            │
│                               │        │  services/governance.service.ts      │
│                               │        │    dynamic KPI/policy/compliance     │
│                               │        │  services/cl-engine/                 │
│                               │        │    continuous-learning loop          │
└─────────────────────────────┘        └──────────────────────────────────────┘
                                                        │
                                                        ▼
                                          ┌───────────────────────────┐
                                          │   OpenRouter (external)    │
                                          │  OpenAI-compatible API,    │
                                          │  hosts many models incl.   │
                                          │  free-tier ones            │
                                          └───────────────────────────┘
```

## Request flow: analyzing a contract

1. **Client submits a contract.**
   - `POST /api/v1/contracts/analyze` with `{ contract_text }` for pasted text, or
   - `POST /api/v1/contracts/analyze-file` (multipart, field `file`) for a PDF/DOCX/TXT upload.
2. For file uploads, `text-extraction.ts` converts the file to plain text and the controller SHA-256-hashes it. `execution-store.findByTextHash()` checks whether this exact content has already been analyzed; if so, the request short-circuits into a `duplicateOfId`-tagged record that reuses the original result, and a `Blocked` audit event (`duplicate_upload_detected`) is recorded — no LLM calls are spent re-analyzing identical content.
3. For new content, `runPipeline(rawText, meta)` in `services/pipeline/index.ts` runs the 5 nodes in sequence, persisting the in-progress `ExecutionRecord` to `execution-store.ts` after every node so a client can poll `GET /api/v1/contracts/executions/:id` mid-run:
   - **Node 1 — Webhook Trigger**: validates that `raw_text` is a non-empty string. No AI call.
   - **Node 2 — Text Formatter**: strips control characters, collapses whitespace, and truncates at a 60,000-character cap, setting a `truncated` flag if the input was cut. No AI call.
   - **Node 3 — Extractor & Absence Agent**: one OpenRouter call that returns structured `metadata` (20 fields), `clauses` (15 canonical categories, present/absent + excerpt), `obligations` (per-party), and `absence_flags` (missing-clause callouts) as a single JSON object.
   - **Node 4 — Risk Matrix Evaluator**: one OpenRouter call over Node 3's structured output that returns named `risks` (each with a severity and a grounded explanation), a `risk_matrix` (commercial/legal/operational/compliance/overall, 0–10), and a self-reported risk-detection confidence.
   - **Node 5 — JSON Guardrail Formatter**: one OpenRouter call that writes the executive summary narrative fields; the final `recommendation` is then computed **deterministically in code** (not by the LLM) from the validated risk matrix, severity counts, and metadata completeness, so it cannot drift with prompt phrasing. This node assembles the final `PipelineResult`.
4. If any node throws (validation failure, LLM error, exhausted JSON-retry budget, OpenRouter rate limit, etc.), the orchestrator catches it and persists a graceful `status: 'error'` record with the failure message — the API never 500s on a pipeline failure, it returns a 200 with an execution record whose `status` field tells the real story. Every review and governance endpoint is agnostic to which case occurred; a caller must check `status`, not just the HTTP code.
5. On success, the client fetches `GET /api/v1/contracts/:id/review` to render extracted metadata, clauses, obligations, risks, the executive summary, confidence scores, and recommendation, plus any prior human review state.

## Human review workflow

A completed analysis isn't a final verdict by itself — it's an input to a reviewer. `services/review-store.ts` keeps an in-memory `ReviewState` per contract (`editedMetadata`, `riskDecisions`, `comments`, `finalDecision`). Five endpoints under `/api/v1/contracts/:id/review*` let a reviewer edit an extracted field, accept or reject each individual risk finding, leave comments, and record a final `approved`/`rejected`/`needs_revision` decision. Every one of these actions is written to the governance audit trail under agent `reviewer`, so the audit log captures not just what the AI produced but what a human did with it.

## Governance and audit

`services/governance-audit-store.ts` is an append-only, capped (200-entry) log where every entry's `entryHash` incorporates the previous entry's hash (SHA-256), so the chain is tamper-evident — altering or deleting a past entry breaks every hash after it. Every pipeline node and every review action write to this same log with a `policyId` tag when the event corresponds to a named policy check (e.g. `POL-EXT-001`, `POL-RISK-004`, `POL-FMT-001`).

`services/governance.service.ts` is the layer that turns that raw log into dashboard data, and it does so **live**:
- `getPoliciesData()` counts real occurrences of each `policyId` in the audit log to produce each rule's `fires` count — nothing is a static placeholder.
- `getComplianceData()` sums fires across the policy rules tagged to each OWASP ASI control to produce that control's `evidence`, and grades it `none` (zero rules implemented for that control), `weak` (rules exist but haven't fired yet), or `strong` (real fire evidence exists) — there is no `moderate` case produced by the current rule set, but the value is part of the recognized vocabulary.
- `getOverviewData()` computes KPIs including a `HITL queue` count sourced from `review-store.countPendingDecisions()` — an execution that finished (`status: 'done'`) but has no `finalDecision` yet counts toward the queue; recording a decision immediately drops the count.
- `getSloData()` computes real observed P95 latency per pipeline stage from `execution-store.list()` timing data, compared against static SLO targets.

See `ai-workflow-and-design-decisions.md` for why each node is scoped the way it is, and `assumptions-limitations-future-enhancements.md` for the explicit tradeoffs behind the in-memory-only, single-model design.

## Continuous learning

`services/cl-engine/` runs a lightweight, in-memory continuous-learning loop independent of the main analysis pipeline: it tracks 4 quality targets (`extraction_completeness`, `risk_score_calibration`, `json_validity_rate`, `recommendation_consistency`), ingests human feedback and per-stage execution traces (`trace-store.ts`, written to by nodes 3–5 on every run), detects drift against baselines, proposes tunable-config experiments, and gates promotions. It is surfaced at `/continuous-learning` in the UI and `/api/v1/continuous-learning` in the API, and is intentionally decoupled from the contract-analysis pipeline so a CL malfunction can never block an actual contract review.

## Project structure

```
backend/src/
  controllers/            HTTP request handlers
  routes/                 Express route wiring
  services/
    pipeline/             5-node contract pipeline
    openai.ts             OpenRouter client + callJsonLLM()
    text-extraction.ts    PDF/DOCX/TXT -> plain text
    execution-store.ts    In-memory execution records
    review-store.ts       In-memory human-review state
    governance-audit-store.ts   Hash-chained audit log
    governance.service.ts        Dynamic KPI/policy/compliance derivation
    agent-config.service.ts      Tunable per-agent config (temperature, token caps, thresholds)
    trace-store.ts        Per-stage execution traces for continuous learning
    cl-engine/            Continuous learning loop
  types/contract.ts       Shared data model
  __tests__/              112 tests (vitest + supertest)

frontend/src/
  components/
    workflow/             Visual 5-node canvas
    contract/              Input panel + review/result panel
  pages/
    governance/            Overview, Policies, Compliance, Audit, Fleet, SLO
    continuous-learning/
  lib/                    API client, governance/CL fixtures
```
