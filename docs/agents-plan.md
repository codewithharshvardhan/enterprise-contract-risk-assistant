# agents-plan.md — Enterprise Contract Risk Workflow

## Overview

A user pastes contract text or uploads a file (`.pdf` / `.docx` / `.txt`). The Express backend runs it through a sequential **5-node pipeline** — two deterministic ingestion nodes followed by three LLM-backed agents — that extracts structured legal facts, scores risk across four dimensions, and produces a machine-checked recommendation plus an executive summary. A human reviewer then works the completed analysis through a review workflow (edit metadata, accept/reject individual risks, comment, record a final decision) before the contract is considered closed out. Every step — pipeline node and reviewer action alike — writes to a single hash-chained governance audit log, which is the one and only source of the numbers shown on the Governance dashboard.

**Topology:** Strictly sequential, no branching or routing. `runPipeline()` in `backend/src/services/pipeline/index.ts` calls the five nodes in fixed order: `Node_1_Webhook → Node_2_Contract_Input → Extractor_and_Absence_Agent → Risk_Matrix_Evaluator → JSON_Guardrail_Formatter`. Each node's output is the next node's sole input. `runPipeline()` never throws — any node failure is caught, recorded as a synthetic `error` node for the first incomplete stage, and returned to the caller as an `ExecutionRecord` with `status: 'error'`, so the HTTP layer never has to translate a pipeline crash into a 500.

**Framework:** There is no agent SDK / harness in this codebase. Each LLM-backed node makes a single, direct HTTP call through the official `openai` npm package pointed at OpenRouter's OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`), via a shared helper `callJsonLLM<T>()` in `backend/src/services/openai.ts`. That helper: sends `{ systemPrompt, userPrompt, temperature, maxTokens }`, strips markdown code fences from the response, `JSON.parse`s it, and — if parsing fails — retries up to 3 attempts total, appending a self-correction instruction to the conversation on each retry ("Your previous response was not valid JSON... Return ONLY the JSON object."). All three agent model calls resolve to the same configured model, `MODEL` in `openai.ts`: `process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free'`. (The shipped `backend/.env.example` sets `OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free` as an example value — a different model than the code's own fallback constant. Either way, the model is fully operator-swappable via one environment variable; there is no per-agent hardcoded model name anywhere in the node files.)

**Shared state:** A per-request in-memory object chain — `rawText → formattedText → extractorOutput → riskOutput → result` — is threaded through the five node functions by `runPipeline()`'s own local variables. There is no persistent inter-agent memory. Once the pipeline completes, the full `ExecutionRecord` (all five node outputs, the final `PipelineResult`, timestamps, durations) is written to `execution-store.ts`, an in-memory circular buffer capped at 50 records (`MAX_SIZE = 50`) — this backend has no real database anywhere.

**Non-LLM nodes matter to governance too:** Node 1 (payload validation) and Node 2 (sanitize/truncate) run no model call, complete in ~1ms, and still emit their own audit events (`payload_received`/`payload_validation`, `text_sanitized`/`text_truncated`) that feed the governance pipeline-funnel chart, even though neither has a "prompt" or a "config namespace" the way the three LLM agents do.

---

## Agent Interaction Diagram

```
User / Frontend
      |
      | POST /api/v1/contracts/analyze        { contract_text }
      | POST /api/v1/contracts/analyze-file    multipart file (pdf/docx/txt)
      v
[Backend: runPipeline()]
      |
      |---(1) { raw_text } ------------------------------->[ Node_1_Webhook ]
      |                                                      no LLM · payload shape check
      |<--- rawText (validated) ----------------------------
      |
      |---(2) rawText ------------------------------------>[ Node_2_Contract_Input ]
      |                                                      no LLM · sanitize, truncate at 60,000 chars
      |<--- formattedText, truncated -----------------------
      |
      |---(3) formattedText ------------------------------>[ Extractor_and_Absence_Agent ]
      |                                                      OpenRouter model, temp 0.1, max_tokens 2500 (effective)
      |<--- { metadata, clauses, obligations, absence_flags }
      |
      |---(4) extractorOutput ----------------------------->[ Risk_Matrix_Evaluator ]
      |                                                      OpenRouter model, temp 0.1, max_tokens 1800 (effective)
      |<--- { risks, risk_matrix, risk_detection_confidence }
      |
      |---(5) extractorOutput + riskOutput ----------------->[ JSON_Guardrail_Formatter ]
      |                                                      OpenRouter model, temp 0.0, max_tokens 900 (effective)
      |<--- { summary } -------------------------------------
      |     (recommendation + contract_status computed HERE by deterministic
      |      code, `determineRecommendation()` / `determineContractStatus()`
      |      — never by the LLM)
      |
      | executionStore.save(ExecutionRecord { status: 'done', result, nodes[] })
      | auditStore.record('pipeline', 'pipeline_run_completed', ...)
      v
[Response to Frontend]  full ExecutionRecord (nodes[], result, timings)
      |
      | (reviewer works the result in ResultPanel.tsx)
      v
reviewStore mutations -> auditStore.record('reviewer', <event>, 'Success', ...)
```

---

## Node 1: Node_1_Webhook (no LLM)

**Purpose:** Pure ingestion gate — the only job is to confirm the caller sent a usable payload before anything else runs.

**File:** `backend/src/services/pipeline/node1-webhook.ts`

**Logic:** `runNode1Webhook({ raw_text }, contractId)` checks `raw_text` is a non-empty string (after trim). If not, it records `payload_validation` / `Blocked` and throws, which `runPipeline()` catches and turns into an `error` `ExecutionRecord`. On success it records `payload_received` / `Success` with `{ contractId, inputLength }` and returns immediately (`durationMs: 1`).

**Also reachable via:** `POST /webhook` (n8n-style webhook controller, `webhook.controller.ts`), which accepts `raw_text` either at the request body's top level or nested under `body.raw_text`, then calls the same `runPipeline()`.

---

## Node 2: Node_2_Contract_Input (no LLM)

**Purpose:** Normalize and bound the raw text before it reaches any model call.

**File:** `backend/src/services/pipeline/node2-input.ts`

**Logic:** `runNode2ContractInput(rawText, contractId)` strips null bytes, normalizes line endings (`\r\n`/`\r` → `\n`), collapses runs of spaces/tabs, collapses 3+ blank lines to 2, trims, then truncates at `MAX_CHARS = 60000` characters. This 60,000-char ceiling was deliberately raised from an earlier 8,000-char cap specifically so realistic multi-page MSAs/vendor agreements are not silently cut mid-clause; it is not unlimited — the code comment explains the ceiling stays in place to keep prompt/token cost predictable, but truncation is now surfaced explicitly rather than happening invisibly. Always records `text_sanitized` / `Success`; additionally records `text_truncated` / `Blocked` only when truncation actually occurred.

Note: the Governance → Policies page's static `confidenceGates` catalog (`governance.service.ts`) still describes this stage's gate as `"Length gate: 50–8000 chars; sanitize control chars"` — that label is stale relative to the current 60,000-char constant in this file (and the 50-char minimum it references is actually enforced one stage later, by the extractor's `min_input_chars` check, not here). It is cosmetic text only; it does not affect actual truncation behavior.

---

## Agent 1: Extractor_and_Absence_Agent

**Purpose:** Extract structured legal metadata (20 fields), determine which of 15 canonical clause categories are present/absent with excerpts, list concrete party obligations, and flag missing standard terms.

**File:** `backend/src/services/pipeline/node3-extractor.ts`

**Trigger:** Called by `runPipeline()` immediately after Node 2, with the sanitized/truncated text as `formattedText`.

**Inputs:** `formattedText` (string). Config read at call time: `extractor.max_tokens` (fallback `7000` in the node file), `extractor.temperature` (fallback `0.1`), `extractor.min_input_chars` (fallback `MIN_INPUT_CHARS = 50`, a local const in this same file).

**Tools:** None. Single `callJsonLLM()` call; no tool/function-calling surface exists anywhere in this codebase.

**Model:** The configured OpenRouter model (`OPENROUTER_MODEL`, default `google/gemma-4-26b-a4b-it:free`).

**System prompt outline (verbatim structure, not paraphrased):**
- Role: "an enterprise contract extraction agent"
- Requires a single JSON object (no markdown fences) shaped exactly as:
  `{ metadata: {20 string fields}, clauses: [{category, present, excerpt}], obligations: [{party, category, description}], absence_flags: string[] }`
- Any metadata field not found in the text must be filled with the exact sentinel string `"Not specified in contract"` (`NOT_FOUND` constant) — never omitted, never hallucinated.
- `clauses` must contain exactly one entry per canonical category, in the fixed order defined by `CLAUSE_CATEGORIES` (15 categories: Limitation of Liability, Indemnification, Confidentiality/NDA, Intellectual Property Rights, Termination for Convenience, Termination for Cause, Governing Law/Jurisdiction, Dispute Resolution/Arbitration, Force Majeure, Assignment, Non-Compete/Non-Solicitation, Data Protection/Privacy, Insurance Requirements, Warranty/Representations, Audit Rights).
- `obligations.category` must be one of `payment | delivery | reporting | notification | compliance | renewal | other`.
- Instructed not to hallucinate parties, dates, or amounts not present in the text.

**Output coercion (defensive, in code, not trusted from the model):** `coerceMetadata()` backfills any missing/blank field with the `NOT_FOUND` sentinel; `coerceClauses()` guarantees all 15 categories are represented even if the model dropped one, and truncates excerpts to 400 chars; `coerceObligations()` validates the category enum and drops obligations with an empty description.

**Outputs / hand-off:** `{ metadata, clauses, obligations, absence_flags }` passed as the sole input to Risk_Matrix_Evaluator. The node also returns a `NodeOutput` summary string like `"Extracted 20 metadata fields, 9/15 clauses present, 4 obligations, 2 absence flags"`.

**Guardrails:**
- Temperature and max_tokens are always read from `agentConfigService`, never inlined at the call site.
- Minimum input length gate: if `formattedText.trim().length < min_input_chars`, the node throws before ever calling the LLM (`POL-EXT-001`).
- No retry loop of its own for extraction failures beyond the shared 3-attempt JSON self-correction inside `callJsonLLM()`; if that still fails, the node records failure and re-throws with a message that names the model (`Node 3 Extractor failed via OpenRouter (${MODEL}): ...`), which `runPipeline()` turns into an `error` execution record.

**Observability:**
- `recordTrace({ stage: 'extractor', outcome: 'success', value: durationMs, segment: 'all_contracts', confidence: clauseFillRatio, data: { contract_id, model } })` on success, where `clauseFillRatio = presentClauseCount / 15` rounded to 2 decimals.
- `recordTrace({ stage: 'extractor', outcome: 'failure', value: durationMs, segment: 'all_contracts', confidence: 0, data: { contract_id, model } })` on failure.

**Governance mapping:**

Audit events (agent name in the log is `Extractor_and_Absence_Agent`):
| Event | Outcome | When |
|---|---|---|
| `extractor_policy_check` (`policyId: POL-EXT-001`) | Blocked / Success | input-length gate, before the LLM call |
| `extractor_run_started` | Success | always, right after the length gate passes |
| `extractor_policy_check` (`policyId: POL-EXT-002`) | Success | temperature audit note, recorded unconditionally (this check never actually blocks in current code) |
| `extractor_policy_check` (`policyId: POL-EXT-003`) | Success | max_tokens audit note, recorded unconditionally |
| `extractor_run_completed` | Blocked / Success | after the LLM call resolves or throws |

Policy rules (from `governance.service.ts`'s static catalog — the single source of policy IDs the dashboard cites): `POL-EXT-001` (block, ASI-04), `POL-EXT-002` (audit, ASI-02), `POL-EXT-003` (block, ASI-04).

Fleet identity (static, `governance.service.ts`): name `Extractor_and_Absence_Agent`, ring 1, Trust Tier `Trusted`, trust score `0.80`, allowed tools `[]`.

SLO: P95 latency target for this stage — **4,000 ms** (`governance.service.ts` `getSloData()`, computed live from real node durations in `execution-store.ts`, not a fixture).

**Continuous-learning mapping:**

Quality target: `extraction_completeness` (segment `all_contracts`, direction `max`, `drift_pct: 10`, severity `warn`, owner `extractor`). Resolver (`continuous-learning.service.ts` → `registerResolver('extraction_completeness', ...)`): averages the `confidence` field of all `cl_traces` rows where `stage === 'extractor' && outcome === 'success'`, then subtracts an edit-penalty derived from `cl_feedback` rows with `kind === 'extraction_edit'` (capped at 0.3), clamped at 0.

Tunable config (namespace `extractor`), reflecting both the node-file fallback and the effective seeded value — see "Continuous Learning" section below for why they differ.

---

## Agent 2: Risk_Matrix_Evaluator

**Purpose:** Score the contract across four risk dimensions (0–10 scale) plus an overall score, and list concrete, grounded risk findings.

**File:** `backend/src/services/pipeline/node4-risk.ts`

**Trigger:** Called immediately after Extractor_and_Absence_Agent succeeds, receiving `extractorOutput` as its full input (serialized as JSON in the user prompt).

**Inputs:** `extractorOutput` (metadata, clauses, obligations, absence_flags). Config read at call time: `risk.max_tokens` (fallback `5000`), `risk.temperature` (fallback `0.1`).

**Tools:** None.

**Model:** The configured OpenRouter model.

**System prompt outline:**
- Role: "an enterprise contract risk-analysis agent"
- Requires JSON shaped `{ risks: [{category, title, severity, explanation, related_clause}], risk_matrix: {commercial, legal, operational, compliance, overall_score}, risk_detection_confidence }`
- `severity` must be `low | medium | high`.
- Each risk's `explanation` must be concrete and grounded (which field/clause/absence flag triggered it) — explicitly forbidden from being a generic template sentence.
- Names specific risk patterns to consider: uncapped liability, one-sided/missing indemnification, missing confidentiality, unfavorable/missing termination terms, missing dispute resolution/governing law, vague notice periods, silent auto-renewal, ambiguous SLAs, one-sided obligations, missing data-protection clauses, unbounded financial commitments, missing insurance requirements.
- Each of the 5 risk_matrix scores is on a **0–10** scale (not 1–5), and `overall_score` should reflect overall risk holistically, not simply the mean of the other four.
- `risk_detection_confidence` (0–1) is the model's own confidence in the completeness of its risk list.

**Output coercion:** `coerceRiskMatrix()` clamps every score into `[0, 10]` and rounds to 2 decimals (`clampScore`). `coerceRisks()` defaults an invalid/missing severity to `'medium'`, fills sensible defaults for missing category/title, and drops any risk with an empty explanation.

**Confidence is computed by code, not the LLM:** `computeExtractionConfidence()` and `computeClauseConfidence()` are pure functions over Node 3's already-validated output (fraction of metadata fields that are not the `NOT_FOUND` sentinel; fraction of clauses that are either present-with-an-excerpt or correctly marked absent). Only `risk_detection` confidence comes from the model's self-reported `risk_detection_confidence` (clamped to `[0,1]`).

**Outputs / hand-off:** `{ risks, risk_matrix, confidence: {extraction, clause_identification, risk_detection} }` passed to JSON_Guardrail_Formatter alongside the original `extractorOutput`.

**Guardrails:**
- `POL-RISK-004` — temperature is audited as `Success` only if `temperature <= 0.3`, else `Blocked` (this is a genuine conditional check, unlike the always-Success extractor/formatter temperature checks).
- `POL-RISK-001` — after the call, every one of the 5 risk_matrix scores is checked to be within `[0, 10]`; recorded `Success`/`Blocked` accordingly (does not currently halt the pipeline on failure — coercion already clamped the values, so this audit event is effectively always `Success` in practice).
- `POL-RISK-002` — every risk's severity is checked against the `low|medium|high` enum; same note as above (coercion already guarantees validity).
- No LLM-call retry beyond `callJsonLLM()`'s shared 3-attempt JSON self-correction; on final failure the node records failure and re-throws `Node 4 Risk Evaluator failed via OpenRouter (${MODEL}): ...`.

**Observability:**
- `recordTrace({ stage: 'risk_evaluator', outcome: 'success', value: durationMs, segment: 'all_contracts', confidence: riskOutput.confidence.risk_detection, data: { contract_id, model } })` on success; `outcome: 'failure'` variant on error.

**Governance mapping:**

Audit events (agent name `Risk_Matrix_Evaluator`):
| Event | Outcome | When |
|---|---|---|
| `risk_policy_check` (`POL-RISK-003`) | Success | audit note that thresholds are config-sourced, before the call |
| `risk_policy_check` (`POL-RISK-004`) | Success if `temperature <= 0.3` else Blocked | before the call |
| `risk_run_started` | Success | before the call |
| `risk_policy_check` (`POL-RISK-001`) | Success/Blocked on score-range check | after the call |
| `risk_policy_check` (`POL-RISK-002`) | Success/Blocked on severity-enum check | after the call |
| `risk_run_completed` | Blocked/Success | after the call resolves or throws |

Policy rules: `POL-RISK-001` (block, ASI-02), `POL-RISK-002` (block, ASI-02), `POL-RISK-003` (audit, ASI-03), `POL-RISK-004` (audit, ASI-02).

Fleet identity: name `Risk_Matrix_Evaluator`, ring 1, Trust Tier `Trusted`, trust score `0.82`, allowed tools `[]`.

SLO: P95 latency target — **3,000 ms**.

**Continuous-learning mapping:**

Two quality targets are owned by this agent:

- `risk_score_calibration` (segment `all_contracts`, direction `min`, `drift_pct: 10`, severity `warn`, owner `risk`) — resolver computes the sample standard deviation of `data.overall_score` across `cl_traces` rows where `stage === 'risk_evaluator' && outcome === 'success'`, with each `cl_feedback` row of `kind === 'risk_score_edit'` injected as a `2.0`-value outlier before computing variance. Needs at least 2 in-window trace rows or returns `null`.
- `recommendation_consistency` (segment `reviewed_contracts`, direction `max`, `drift_pct: 10`, severity `warn`, owner `risk`) — resolver joins `cl_traces` (`stage === 'risk_evaluator', outcome === 'success'`) to `cl_feedback` rows of `kind` in `['review_approve', 'review_reject', 'review_edit']` on `data.contract_id`; agreement rate = count where the joined feedback kind is `review_approve` divided by total joined rows.

---

## Agent 3: JSON_Guardrail_Formatter

**Purpose:** Write the executive summary (10 plain-language fields) and finalize the machine-computed recommendation and contract-status bucket. Despite the name inherited from the earlier design, this stage's LLM call **only produces the executive summary** — it is explicitly instructed not to restate a recommendation code, because the recommendation is computed deterministically by code, not by the model.

**File:** `backend/src/services/pipeline/node5-guardrail.ts`

**Trigger:** Called after both Extractor_and_Absence_Agent and Risk_Matrix_Evaluator succeed, receiving both of their outputs.

**Inputs:** `extractorOutput`, `riskOutput.risks`, `riskOutput.risk_matrix` (merged into one JSON user prompt). Config read at call time: `formatter.max_tokens` (fallback `3000`), `formatter.temperature` (fallback `0`), `formatter.low_risk_max_score` (fallback `3.0`), `formatter.moderate_risk_max_score` (fallback `6.5`).

**Tools:** None.

**Model:** The configured OpenRouter model, called at temperature `0` for deterministic prose.

**System prompt outline:**
- Role: "an enterprise contract executive-summary writer"
- Requires JSON with exactly 10 string fields: `purpose, parties, commercial_overview, key_dates, financial_commitments, major_obligations, significant_risks, important_clauses, recommended_next_steps, narrative`.
- Every field must be grounded only in the provided data (1–3 sentences); `narrative` is a standalone 4–6 sentence paragraph.
- `recommended_next_steps` may be actionable (e.g. "Route to legal for indemnification review") but **must not** restate a formal recommendation code — "that is decided separately."
- If a section has nothing notable (e.g. no risks), the model is told to say so plainly rather than pad.

**The real decision logic — `determineRecommendation()` (deterministic, not an LLM call):**
```
if overall_score >= 8 OR highSeverityRiskCount >= 2        -> HIGH_RISK_IMMEDIATE_REVIEW
else if 2+ of {no parties, no effective_date, no contract_value} missing
                                                             -> REQUEST_MISSING_INFORMATION
else if absence_flags mention governing law/dispute
        resolution/liability/indemnification, OR legal >= 6 -> LEGAL_REVIEW_REQUIRED
else if commercial >= 6                                     -> PROCUREMENT_REVIEW_REQUIRED
else if any absence_flags OR 1 high-severity risk OR
        overall_score >= 4                                  -> MINOR_REVISIONS_RECOMMENDED
else                                                         -> READY_FOR_REVIEW
```
`contract_status` (`low_risk | moderate_risk | high_risk`) is a second, separate deterministic bucket: `overall_score <= low_risk_max_score` → `low_risk`; `<= moderate_risk_max_score` → `moderate_risk`; else `high_risk`.

**Outputs:** The full `PipelineResult` — `contract_status`, `metadata`, `clauses`, `obligations`, `absence_flags`, `risks`, `risk_matrix`, `summary`, `confidence` (5 scores including a computed `overall`), and `recommendation`. This becomes `ExecutionRecord.result`, returned to the frontend and persisted in `execution-store.ts`.

**Guardrails:**
- `POL-FMT-003` — temperature audited `Success` only if it is exactly `0`, else `Blocked`, checked before the call.
- `POL-FMT-001` — records `Success` immediately after a successful LLM call, or `Blocked` (with the error) if the call throws — this is the real "LLM call succeeded" gate, and the only one of the four formatter policy checks whose outcome can actually vary based on runtime behavior of the call itself.
- `POL-FMT-004` — after `determineRecommendation()` runs, checks the result is one of the 6 valid `Recommendation` enum values (`VALID_RECOMMENDATIONS` in `types/contract.ts`); always `Success` in current code because the function's return type is statically constrained to the enum.
- `POL-FMT-002` ("Schema completeness gate") — recorded immediately after `coerceSummary()` runs: `Success` if all 10 `ExecutiveSummary` fields are populated (none left at the `"Not available."` fallback), `Blocked` otherwise.

**Observability:**
- `recordTrace({ stage: 'formatter', outcome: 'success', value: durationMs, segment: recommendation, confidence: confidenceOverall, data: { contract_id, schema_valid: true, output_bytes } })` on success; `outcome: 'failure'` variant (with `segment: 'json_serialization'`) on error.

**Governance mapping:**

Audit events (agent name `JSON_Guardrail_Formatter`):
| Event | Outcome | When |
|---|---|---|
| `formatter_policy_check` (`POL-FMT-003`) | Success/Blocked on temperature check | before the call |
| `formatter_run_started` | Success | before the call |
| `formatter_policy_check` (`POL-FMT-001`) | Success/Blocked | immediately after the call resolves/throws |
| `formatter_policy_check` (`POL-FMT-002`) | Success/Blocked | after `coerceSummary()`, based on schema completeness |
| `formatter_run_completed` | Blocked | only on the failure path (no matching Success-path `formatter_run_completed` event is written on the failure branch's early return — success case's `formatter_run_completed` is written once at the very end after `POL-FMT-004`) |
| `formatter_policy_check` (`POL-FMT-004`) | Success/Blocked | after `determineRecommendation()` |
| `formatter_run_completed` | Success | at the very end, with `recommendation`, `contract_status`, `outputBytes`, `durationMs` |

Policy rules (11 total, static catalog in `governance.service.ts`): `POL-FMT-001` (block, ASI-02), `POL-FMT-002` (block, ASI-02), `POL-FMT-003` (audit, ASI-02), `POL-FMT-004` (block, ASI-02) — all four are recorded by `node5-guardrail.ts`.

Fleet identity: name `JSON_Guardrail_Formatter`, ring 1, Trust Tier `Trusted`, trust score `0.90`, allowed tools `[]`.

SLO: P95 latency target — **2,000 ms**.

**Continuous-learning mapping:**

Quality target: `json_validity_rate` (segment `all_contracts`, direction `max`, `drift_pct: 5`, severity **`block_promotion`** — the only baseline of the four that arms the promotion circuit breaker — owner `formatter`). Resolver: success rate of all `cl_traces` rows where `stage === 'formatter'` (`count(outcome === 'success') / count(all)`), no feedback supplement needed since validity is binary and fully observable from traces.

---

## File Upload and Duplicate Detection

**Route:** `POST /api/v1/contracts/analyze-file` (multipart, field name `file`, 15 MB limit via `multer.memoryStorage()`, configured in `backend/src/routes/contract.route.ts`; a `MulterError` on this route is caught and turned into a `400` with a message rather than propagating as a 500).

**Text extraction** (`backend/src/services/text-extraction.ts`): `extractTextFromFile(buffer, mimetype, filename)` supports exactly `.pdf`, `.docx`, `.txt` (`SUPPORTED_EXTENSIONS`). It checks the file extension first, only falling back to the MIME type if the filename has no recognizable extension. PDFs go through `pdf-parse`; DOCX through `mammoth.extractRawText`; TXT is read as a raw UTF-8 buffer. Any other extension throws `Unsupported file type "..."`, surfaced to the caller as a 400. If the extracted text is empty/whitespace-only (e.g. a scanned image PDF with no OCR text layer), the controller returns a 400 explaining that before ever invoking the pipeline.

**Duplicate detection** (`contract.controller.ts` → `analyzeContractFile`): once text is successfully extracted, it is SHA-256 hashed (`crypto.createHash('sha256')`) and looked up via `executionStore.findByTextHash(textHash)`, which only matches prior records that are not themselves already a duplicate (`duplicateOfId` unset). If a match is found:
- No pipeline run happens at all — the prior record is shallow-cloned into a brand-new `ExecutionRecord` with a fresh `id`/`contractId`, new timestamps, the new file's `sourceFilename`, and `duplicateOfId` pointing at the original.
- An audit event `duplicate_upload_detected` is recorded under agent `'pipeline'` with outcome `Blocked`, carrying `{ contractId, duplicateOfId, sourceFilename, textHash }`.
- The cloned record (reusing the original's `result`) is returned immediately to the caller.

If no match is found, `runPipeline(text, { sourceFilename, textHash })` runs normally, and the resulting `ExecutionRecord` carries `sourceFilename`/`textHash` for future dedup lookups. The frontend's `ContractInputPanel.tsx` triggers `runFile()` immediately on file selection (`<input type="file" accept=".pdf,.docx,.txt">`), with no separate "submit" step for the file path.

---

## Human Review Workflow

Every completed (or even still-processing) contract has an associated `ReviewState`, created lazily on first access (`review-store.ts`, an in-memory `Map<contractId, ReviewState>` — `{ contractId, editedMetadata, riskDecisions, comments, finalDecision?, decidedBy?, decidedAt? }`). There is no separate review "queue" data structure; the Governance dashboard's HITL queue KPI is simply `reviewStore.countPendingDecisions()` counting `status: 'done'` executions that have no `finalDecision` yet.

Five REST endpoints, all under `/api/v1/contracts/:id/review*` (`contract.route.ts` / `contract.controller.ts`), each of which — apart from the plain GET — writes a governance audit event under agent `'reviewer'`:

| Method + path | Controller fn | Reviewer action | Audit event |
|---|---|---|---|
| `GET /:id/review` | `getReview` | fetch execution + review state | (none — read-only) |
| `PATCH /:id/review/metadata` | `updateReviewMetadata` | edit one or more metadata fields | `metadata_edited` — `{ contractId, before, after }` |
| `POST /:id/review/risk-decision` | `setRiskDecision` | accept/reject a specific risk finding by id | `risk_decision_recorded` — `{ contractId, riskId, decision }` |
| `POST /:id/review/comment` | `addReviewComment` | free-text comment | `comment_added` — `{ contractId, author }` |
| `POST /:id/review/decision` | `setFinalDecision` | final call: `approved` / `rejected` / `needs_revision` | `final_decision_recorded` — `{ contractId, decision, decidedBy }` |

All five are recorded with outcome `Success` — there is no reviewer-side policy that can block these writes (no length caps, no auth check on `decidedBy`/`author`); they are logged for traceability, not enforcement.

**What the reviewer UI (`frontend/src/components/contract/ResultPanel.tsx`) actually exposes:**
- Every one of the 19 non-`parties` metadata fields renders as an `<input>` that PATCHes `review/metadata` `onBlur`; the merged view (`{...result.metadata, ...draft}`) is what's displayed, so an edit is reflected immediately without waiting for the server round-trip.
- Each risk finding gets independent **Accept** / **Reject** buttons calling `POST review/risk-decision`; the button that matches the stored decision is highlighted.
- A comment input + **Add** button (also triggered by Enter) calls `POST review/comment`; comments render newest-last with a timestamp.
- Three final-decision buttons — **Approve**, **Needs Revision**, **Reject** — call `POST review/decision`; the active one is highlighted and the current `finalDecision` is shown in the panel header.

None of this workflow touches the Continuous Learning feedback store (`feedback-store.ts`) directly in the current code — `recordFeedback()` is only invoked via the separate `POST /api/v1/contracts/feedback` endpoint (`submitFeedback` controller, arbitrary `{ stage, kind, contract_id, data }`), which nothing in the shipped frontend currently calls. The `recommendation_consistency` continuous-learning metric described below is therefore effectively unpopulated in this build unless a caller submits `review_approve` / `review_reject` / `review_edit` feedback through that generic endpoint by hand — the review-workflow endpoints above write to the governance audit log, not to `cl_feedback`.

---

## Governance and Observability Summary

Everything on the Governance dashboard (`GET /api/v1/governance/*`, `governance.service.ts`) is computed from two live sources — the hash-chained audit trail (`governance-audit-store.ts`) and the execution store (`execution-store.ts`) — plus a handful of static catalogs (policy rule definitions, fleet identities, OWASP control list) whose *fires/evidence/grade* fields are always recomputed live, never hardcoded to a fixed "looks good" number.

### Audit log mechanics

`governance-audit-store.ts`: each `record(agent, event, outcome, detail?)` call computes `entryHash = SHA-256(prevHash + JSON.stringify({idx, time, agent, event, outcome, chain: 'verified', detail}))` (displayed truncated as `<first 8 hex>…<last 4 hex>`), chains to the previous entry's hash, and unshifts into a ring buffer capped at `MAX_EVENTS = 200`. `list()` returns everything currently held (up to 200); `recent(n=8)` returns the newest few. The Governance → Audit page's chain-verification badge is a string label (`'verified'`) set at write time, not a re-verification computed at read time.

### Consolidated audit event catalog (by emitting file)

| Emitting file | Agent name in log | Events |
|---|---|---|
| `node1-webhook.ts` | `Node_1_Webhook` | `payload_validation` (Blocked), `payload_received` (Success) |
| `node2-input.ts` | `Node_2_Contract_Input` | `text_sanitized` (Success), `text_truncated` (Blocked, conditional) |
| `node3-extractor.ts` | `Extractor_and_Absence_Agent` | `extractor_policy_check` ×3 (`POL-EXT-001/002/003`), `extractor_run_started`, `extractor_run_completed` |
| `node4-risk.ts` | `Risk_Matrix_Evaluator` | `risk_policy_check` ×4 (`POL-RISK-001/002/003/004`), `risk_run_started`, `risk_run_completed` |
| `node5-guardrail.ts` | `JSON_Guardrail_Formatter` | `formatter_policy_check` ×4 (`POL-FMT-001/002/003/004`), `formatter_run_started`, `formatter_run_completed` |
| `pipeline/index.ts` | `pipeline` | `pipeline_run_started`, `pipeline_run_completed` |
| `contract.controller.ts` | `pipeline` | `duplicate_upload_detected` (Blocked) |
| `contract.controller.ts` | `reviewer` | `metadata_edited`, `risk_decision_recorded`, `comment_added`, `final_decision_recorded` (all Success) |

### Policy Rule Table (static catalog, `governance.service.ts` `policyRules`)

| ID | Label | Scope | Action | OWASP | Actually fired by current node code? |
|---|---|---|---|---|---|
| POL-EXT-001 | Contract text length gate | extractor | block | ASI-04 | yes |
| POL-EXT-002 | Temperature lock (extractor) | extractor | audit | ASI-02 | yes (always Success — not a real conditional check) |
| POL-EXT-003 | Max token enforcement (extractor) | extractor | block | ASI-04 | yes (always Success — not a real conditional check) |
| POL-RISK-001 | Score range validation | risk_evaluator | block | ASI-02 | yes |
| POL-RISK-002 | Recommendation enum guard | risk_evaluator | block | ASI-02 | yes |
| POL-RISK-003 | Threshold source enforcement | risk_evaluator | audit | ASI-03 | yes (always Success) |
| POL-RISK-004 | Temperature lock (risk) | risk_evaluator | audit | ASI-02 | yes (genuinely conditional: `temperature <= 0.3`) |
| POL-FMT-001 | JSON validity gate | formatter | block | ASI-02 | yes |
| POL-FMT-002 | Schema completeness gate | formatter | block | ASI-02 | yes (genuinely conditional: all 10 `ExecutiveSummary` fields populated) |
| POL-FMT-003 | Temperature zero enforcement | formatter | audit | ASI-02 | yes (genuinely conditional: `temperature === 0`) |
| POL-FMT-004 | Recommendation enum guard (formatter) | formatter | block | ASI-02 | yes |

`getPoliciesData()` computes each rule's real `fires` count from `computePolicyFires()` (a scan of the audit log for `detail.policyId` occurrences), then aggregates those into three "blocked pattern" categories via a `categoryStages` map: `input_validation → [input_validation]`, `output_validation → [output_validation]`, `config_enforcement → [model_call, config_load]`. `total_blocks` counts audit entries with a `policyId` and outcome `Blocked`.

### Per-Agent Fleet Entries (static, `governance.service.ts` `pipelines`)

| Agent name | Trust tier | Trust score | Allowed tools |
|---|---|---|---|
| Extractor_and_Absence_Agent | Trusted | 0.80 | none |
| Risk_Matrix_Evaluator | Trusted | 0.82 | none |
| JSON_Guardrail_Formatter | Trusted | 0.90 | none |

(Node 1 and Node 2 are not modeled as fleet "agents" at all — they don't call an LLM and don't appear on the Fleet page.)

### OWASP ASI Compliance Controls

`governance.service.ts`'s static `compliance.controls` lists all 10 ASI-01..ASI-10 categories with a fixed `rules` count each (ASI-07 "Insecure Plugin Design" has `rules: 0`, since no agent has any tool/plugin surface). `getComplianceData()` computes real `evidence` per control by summing `fires` across every policy rule whose static `owasp` tag matches that control, then derives `grade`:
- `'none'` if the control has `rules === 0` (structurally not implemented — currently only ASI-07)
- `'strong'` if `rules > 0` and `evidence > 0` (genuinely fired at least once in this session's audit trail)
- `'weak'` if `rules > 0` but `evidence === 0` (rules exist but haven't fired yet — e.g. a fresh server with no pipeline runs)

**The grade `'moderate'` is never produced by the backend**, even though the frontend's fixture/styling code (`frontend/src/lib/governance/fixtures.ts`, `gradeColor`) supports rendering it — it's just unused headroom in the color map, not a real backend state. `needs_attention` lists every control whose grade is not `'strong'`. `coverage_pct` = percentage of the 10 controls currently graded `'strong'`.

### Per-Stage SLO Targets (P95 latency, computed live from `execution-store.ts` node durations)

| Stage | Agent | P95 target |
|---|---|---|
| extractor | Extractor_and_Absence_Agent | 4,000 ms |
| risk_evaluator | Risk_Matrix_Evaluator | 3,000 ms |
| formatter | JSON_Guardrail_Formatter | 2,000 ms |

`getSloData()` computes the observed P95 per stage only from `status: 'done'` executions' `nodes[].durationMs`, and reports `status: 'ok'` whenever there are zero observations yet (an honest "nothing to report" rather than a fabricated pass). `error_budget` and `trend_24h` in the response are largely static/derived placeholders (`remaining_pct: 100`, `burn_rate: '0x'`) except `trend_24h`, which is the last 12 real run durations.

### HITL / Review Queue

`Overview`'s `HITL queue` KPI = `reviewStore.countPendingDecisions()` over all `status: 'done'` contract IDs — i.e., completed analyses with no `finalDecision` recorded yet. There is no automatic escalation or SLA timer on this queue in the current code; it is a pure count for the dashboard.

---

## Continuous Learning

The Continuous Learning subsystem (`backend/src/services/continuous-learning.service.ts`, `agent-config.service.ts`, `baselines-store.ts`, `trace-store.ts`, `feedback-store.ts`, `backend/src/services/cl-engine/*`) is what makes the three LLM agents' tunable parameters config-driven rather than hardcoded, and gives an operator a governed path (Capture → Detect → Propose → Validate → Promote, mirrored by the `cl-engine/` file names `detect.ts`, `propose.ts`, `validate.ts`, `promote-watch.ts`) to change them without a redeploy.

### A critical cross-file interaction: seeded config overrides node-file fallbacks

Every node reads its tunables via `agentConfigService.getValue(namespace, key, fallback)`, and `agent-config.service.ts`'s own `SEED_CONFIG` constant is literally `{}` (empty) — so in isolation, the "default" values would be each node file's own inline fallback (`extractor.max_tokens` falls back to `7000`, `risk.max_tokens` to `5000`, `formatter.max_tokens` to `3000`). **However**, `continuous-learning.service.ts` runs `seedAgentConfig()` unconditionally as a **module-level side effect at import time** (guarded only by "skip if any config namespace already exists"), and this route is always mounted (`backend/src/routes/index.ts` mounts `/api/v1/continuous-learning` unconditionally). That seed function calls `agentConfigService.promote(...)` 11 times, writing:

| Namespace.key | Seeded value | Read by any current pipeline node? |
|---|---|---|
| `extractor.max_tokens` | 2500 | yes — overrides the 7000 fallback |
| `extractor.temperature` | 0.1 | yes, but identical to the node's own 0.1 fallback (no observable change) |
| `extractor.min_input_chars` | 50 | yes, but identical to the node's own local `MIN_INPUT_CHARS = 50` (no observable change) |
| `extractor.prompt_variant` | `"default"` | no — not read anywhere in `node3-extractor.ts` |
| `extractor.max_input_chars` | 150000 | no — not read anywhere in the pipeline |
| `risk.max_tokens` | 1800 | yes — overrides the 5000 fallback |
| `risk.temperature` | 0.1 | yes, but identical to the node's own 0.1 fallback (no observable change) |
| `risk.approved_threshold` | 2.0 | no — no current node reads this key |
| `risk.needs_redline_threshold` | 3.5 | no — no current node reads this key |
| `risk.prompt_variant` | `"default"` | no — not read anywhere in `node4-risk.ts` |
| `formatter.max_tokens` | 900 | yes — overrides the 3000 fallback |

Net effect: **the token budgets that actually govern every pipeline run in this build are 2500 / 1800 / 900 tokens** (extractor / risk / formatter) — not the larger literals visible directly in the node files. They're sized to comfortably fit the current schema (20 metadata fields + 15 clauses + obligations for the extractor; a risk list + 4-dimension matrix for risk; a 10-field executive summary for the formatter) while staying below each node's own generous fallback (7000/5000/3000), so a continuous-learning promotion that raises them further still has real, demonstrable room to improve. `formatter.temperature`, `formatter.low_risk_max_score`, and `formatter.moderate_risk_max_score` are never seeded at all, so those three genuinely run at their node-file fallbacks (`0`, `3.0`, `6.5`).

### Quality Targets / Baselines (seeded by `seedBaselines()`, `cl_baselines` collection)

| Metric | Segment | Direction | Severity | Owner |
|---|---|---|---|---|
| `extraction_completeness` | all_contracts | max | warn | extractor |
| `risk_score_calibration` | all_contracts | min | warn | risk |
| `json_validity_rate` | all_contracts | max | **block_promotion** | formatter |
| `recommendation_consistency` | reviewed_contracts | max | warn | risk |

All four are seeded with `target_value: 0` — by design (per the code comment in `baselines-store.ts`), `0` signals "infer from data" rather than a guessed number; the engine's own drift-detection stage is expected to derive the real target/tolerance from observed traffic. `severity: 'block_promotion'` on `json_validity_rate` means: whenever `baselinesStore.hasBlockingBreach()` is true (any `block_promotion` baseline's `last_status === 'breached'`), `agentConfigService.evaluateGate()`'s `no_blocking_breach` check fails and blocks every promotion, regardless of namespace.

### Metric Resolvers (registered in `continuous-learning.service.ts` → `registerResolvers()`)

- **`extraction_completeness`** — average of `confidence` across `cl_traces` rows (`stage='extractor', outcome='success'`), minus an edit-penalty from `cl_feedback` rows of `kind='extraction_edit'` (`min(edits.length / 7 / sampleSize, 0.3)`), floored at 0.
- **`risk_score_calibration`** — sample standard deviation of `data.overall_score` across `cl_traces` rows (`stage='risk_evaluator', outcome='success'`), with each `cl_feedback` row of `kind='risk_score_edit'` injected as a `2.0` outlier value before computing variance. Requires ≥2 in-window trace rows.
- **`json_validity_rate`** — success rate (`count(outcome='success') / count(all)`) over all `cl_traces` rows where `stage='formatter'`.
- **`recommendation_consistency`** — joins `cl_traces` (`stage='risk_evaluator', outcome='success'`) to `cl_feedback` rows of `kind ∈ {review_approve, review_reject, review_edit}` on `data.contract_id`; agreement rate = joined rows where the feedback kind is `review_approve`, divided by total joined rows. As noted above, nothing in the shipped review workflow currently emits these feedback kinds, so this resolver has no real signal to work with unless a caller posts to `/api/v1/contracts/feedback` directly.

### Candidate Scorers (`registerScorers()`, used by the Validate/backtest stage)

- **`extractor`** namespace: `baselineRatio * (candidateMaxTokens / 2500) >= 0.85`, where `candidateMaxTokens` only changes if the candidate's key is `max_tokens` (otherwise assumed `2500`).
- **`risk`** namespace: `row.polarity === 1`.
- **`formatter`** namespace: `candidateMaxTokens >= 900 && row.polarity !== -1`.

### Tunable Config Map — fallback vs. seeded-effective value

| Namespace.key | Node-file fallback | Seeded (effective) value | Quality target moved |
|---|---|---|---|
| `extractor.max_tokens` | 7000 | **2500** | extraction_completeness |
| `extractor.temperature` | 0.1 | 0.1 (seed matches fallback) | extraction_completeness, risk_score_calibration |
| `extractor.min_input_chars` | 50 | 50 (seed matches fallback) | extraction_completeness |
| `extractor.prompt_variant` | n/a — unread | "default" (seeded, unused) | — |
| `extractor.max_input_chars` | n/a — unread | 150000 (seeded, unused) | — |
| `risk.max_tokens` | 5000 | **1800** | risk_score_calibration |
| `risk.temperature` | 0.1 | 0.1 (seed matches fallback) | risk_score_calibration |
| `risk.approved_threshold` | n/a — unread | 2.0 (seeded, unused) | — |
| `risk.needs_redline_threshold` | n/a — unread | 3.5 (seeded, unused) | — |
| `risk.prompt_variant` | n/a — unread | "default" (seeded, unused) | — |
| `formatter.max_tokens` | 3000 | **900** | json_validity_rate |
| `formatter.temperature` | 0 | not seeded — runs at fallback (0) | — |
| `formatter.low_risk_max_score` | 3.0 | not seeded — runs at fallback (3.0) | — |
| `formatter.moderate_risk_max_score` | 6.5 | not seeded — runs at fallback (6.5) | — |

All keys are read exclusively via `agentConfigService.getValue(namespace, key, fallback)` — there is no other place in the codebase where these values are read.

### Promotion Gate (`agent-config.service.ts` `GATE`, `evaluateGate()`)

```
export const GATE = { MIN_SAMPLE: 200, MIN_EFFECT_PCT: 2.0 } as const
```
- **Minimum sample size: 200** trace rows for the candidate's backtest (not 30 — an earlier design used a much lower threshold).
- **Minimum effect size:** `|delta_pct| >= 2.0` percentage points.
- **Circuit breaker:** promotion additionally fails if `opts.blockingBreach` is true, i.e. `baselinesStore.hasBlockingBreach()` — armed only by the `json_validity_rate` baseline in this build.
- Gate inputs for a real promotion always come from the experiment's own backtest record (`cl-engine/promote-watch.ts` → `promoteExperiment()`), never from caller-supplied numbers — a promotion attempt on an experiment that "has not been backtested" is rejected outright.
- Every successful `promote()` call writes a brand-new `AgentConfigVersion` (never mutates in place) and appends a `PromotedExperiment` ledger entry; `rollback(toVersion)` and the automatic watcher `autoRollbackPromotion()` both work the same way — they push a new version restoring an older `namespaces` snapshot, so history is append-only and every state is reachable and auditable.
- **Auto-rollback watcher** (`cl-engine/promote-watch.ts` `watchPromotions()`, registered as a background stage): for each live (`promote_status: 'promoted'`, not yet auto-rolled-back) promotion, once at least `MIN_REALISED = 5` polarity-bearing signals are observed in the trailing 7-day window, it computes a realised lift vs. the pre-promotion control; if the realised lift regresses by 2 percentage points or more (or misses the baseline's target direction while negative), it calls `autoRollbackPromotion()`, which reverts the config to the version immediately prior to that specific promotion and marks it `retired` / `auto_rolled_back: true`.

### Capture (feedback + trace) mechanics

- `recordFeedback({ stage, kind, contract_id?, data? })` (`feedback-store.ts`) writes to the shared `cl_feedback` collection, auto-anchoring to a baseline via `baselinesStore.deriveBaselineId()` when no explicit `baseline_id` is given (tries metric+segment match, then segment match, then a stage-substring match against a baseline's metric/label). The only current caller in this codebase is the generic `POST /api/v1/contracts/feedback` endpoint — the review workflow endpoints (metadata edit, risk decision, comment, final decision) write to the **governance** audit store, not to `cl_feedback`.
- `recordTrace({ stage, outcome, value, segment, confidence, data })` (`trace-store.ts`) writes to `cl_traces`, and is called by all three LLM-backed nodes (extractor, risk_evaluator, formatter) on both their success and failure paths — this is the CL system's real, always-populated signal source, independent of whether any human ever provides feedback.
