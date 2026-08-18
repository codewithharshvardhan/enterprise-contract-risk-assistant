# Enterprise Contract Risk Workflow — arch.md

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React + Vite)                          │
│                                                                           │
│  ┌────────────────────┐  ┌───────────────────────────────────────────┐  │
│  │ ContractInputPanel  │  │            WorkflowCanvas                 │  │
│  │ - textarea          │  │  ┌────────┐ ┌────────┐ ┌────────────────┐ │  │
│  │ - Run Analysis      │  │  │ Node 1 │→│ Node 2 │→│ Node 3         │ │  │
│  │ - file input        │  │  │Webhook │ │  Text  │ │Extractor &     │ │  │
│  │   (.pdf/.docx/.txt) │  │  │Receiver│ │Formatter│ │Absence Agent  │ │  │
│  │ - Webhook URL card  │  │  └────────┘ └────────┘ └────────────────┘ │  │
│  └────────────────────┘  │            ↓↓ animated SVG connectors ↓↓    │  │
│                            │  ┌──────────────────┐ ┌──────────────────┐│  │
│  ┌────────────────────┐   │  │ Node 4           │→│ Node 5           ││  │
│  │  ResultPanel        │   │  │Risk Matrix       │ │JSON Guardrail    ││  │
│  │  - recommendation   │   │  │Evaluator         │ │Formatter         ││  │
│  │  - confidence bars  │   │  └──────────────────┘ └──────────────────┘│  │
│  │  - editable metadata│   └───────────────────────────────────────────┘  │
│  │  - clause grid       │                                                 │
│  │  - obligations       │  ┌──────────────────────────────────────────┐  │
│  │  - risk findings      │  │ ExecutionList — recent runs, click →     │  │
│  │    (accept/reject)    │  │ NodeDetailModal overlay                  │  │
│  │  - reviewer comments  │  └──────────────────────────────────────────┘  │
│  │  - final decision      │                                               │
│  └────────────────────┘                                                   │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │ HTTP via Vite proxy /proxy/service1
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Express + TypeScript)                    │
│                                                                           │
│  POST /webhook                                                          │
│  POST /api/v1/contracts/analyze            (JSON: contract_text)        │
│  POST /api/v1/contracts/analyze-file       (multipart: file)  ────┐     │
│                                                                    ▼     │
│                                                    ┌────────────────────┐│
│                                                    │  runPipeline()     ││
│                                                    │  services/pipeline/││
│                                                    │                    ││
│                                                    │  node1-webhook.ts  ││
│                                                    │  (validate only)   ││
│                                                    │       ↓            ││
│                                                    │  node2-input.ts    ││
│                                                    │  (sanitize/        ││
│                                                    │   truncate 60k)    ││
│                                                    │       ↓            ││
│                                                    │  node3-extractor.ts││
│                                                    │  OpenRouter call   ││
│                                                    │       ↓            ││
│                                                    │  node4-risk.ts     ││
│                                                    │  OpenRouter call   ││
│                                                    │       ↓            ││
│                                                    │  node5-guardrail.ts││
│                                                    │  OpenRouter call + ││
│                                                    │  deterministic     ││
│                                                    │  recommendation    ││
│                                                    └─────────┬──────────┘│
│                                                              │           │
│                                                    ┌─────────▼──────────┐│
│                                                    │ execution-store.ts ││
│                                                    │ In-memory, max 50, ││
│                                                    │ keyed by UUID      ││
│                                                    └────────────────────┘│
│                                                                           │
│  text-extraction.ts — pdf-parse / mammoth / raw read, used only by      │
│  analyze-file before the SHA-256 dedup check against execution-store    │
│                                                                           │
│  review-store.ts — in-memory Map<contractId, ReviewState> backing the   │
│  5 human-review endpoints (GET/PATCH/POST .../review*)                  │
│                                                                           │
│  GET  /api/v1/contracts/executions       → execution-store.ts (list)   │
│  GET  /api/v1/contracts/executions/:id   → execution-store.ts (get)    │
│  POST /api/v1/contracts/feedback         → feedback-store.ts           │
│                                                                           │
│  GET  /api/v1/governance/*               → governance.service.ts       │
│  GET  /api/v1/continuous-learning/*      → continuous-learning.service │
│                                                                           │
│  All node/audit writes go through governance-audit-store.ts            │
│  (hash-chained) and trace-store.ts (cl_traces), read back by            │
│  governance.service.ts and continuous-learning.service.ts respectively │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
                     ┌─────────────────────────┐
                     │  OpenRouter API         │
                     │  https://openrouter.ai/ │
                     │  api/v1 (OpenAI-        │
                     │  compatible)            │
                     │  model = OPENROUTER_MODEL│
                     │  (default:              │
                     │  google/gemma-4-26b-a4b- │
                     │  it:free)               │
                     └─────────────────────────┘
```

---

## Data Flow Description

### Happy-path contract analysis (pasted text)

1. The user pastes contract text into `ContractInputPanel` and clicks "Run Analysis" (or picks the "Sample" contract).
2. The frontend hook `useContractAnalysis.run()` calls `POST /proxy/service1/api/v1/contracts/analyze` with `{ contract_text: string }`.
3. `contract.controller.ts#analyzeContract` validates `contract_text` is a non-empty string (400 otherwise) and calls `runPipeline(contract_text)`.
4. **Node 1 (Webhook Receiver, `node1-webhook.ts`):** Validates that `raw_text` is a non-empty string; throws (and records a `payload_validation` audit event with outcome `Blocked`) if not. No AI, no sanitization. Duration ≈ 1 ms.
5. **Node 2 (Text Formatter, `node2-input.ts`):** Strips null bytes, normalizes line endings and whitespace, collapses 3+ blank lines to 2, and truncates to **60,000 characters** (raised from an earlier, smaller cap so realistic multi-page MSAs aren't cut mid-clause). Emits a `truncated: boolean` flag that is threaded through to the final `ExecutionRecord`. Duration ≈ 1 ms.
6. **Node 3 (Extractor & Absence Agent, `node3-extractor.ts`):** Makes a single OpenRouter chat-completion call (via `callJsonLLM`) asking for a JSON object with `metadata` (20 fields), `clauses` (one entry per of the 15 canonical `CLAUSE_CATEGORIES`), `obligations`, and `absence_flags`. Coerces/repairs the model's JSON into fully-typed shapes (missing metadata fields become the sentinel string `"Not specified in contract"`; missing clause categories are backfilled as `present: false`). Records `POL-EXT-001` (minimum input length gate), `POL-EXT-002` (temperature-lock audit), `POL-EXT-003` (max-token audit) — the latter two fire on every run that reaches this node, before the LLM call itself is attempted.
7. **Node 4 (Risk Matrix Evaluator, `node4-risk.ts`):** Sends Node 3's full JSON output back to OpenRouter, asking for `risks[]` (each with category/title/severity/explanation/related_clause), a `risk_matrix` (commercial/legal/operational/compliance/overall_score, each 0–10), and a `risk_detection_confidence` self-estimate. Also independently *computes* (not LLM-derived) `extraction` and `clause_identification` confidence scores from how many of Node 3's fields were actually filled in. Records `POL-RISK-001` (score-range check), `POL-RISK-002` (severity-enum check), `POL-RISK-003` (audit: thresholds are sourced from `agentConfigService`, not inlined), `POL-RISK-004` (temperature ≤ 0.3 lock).
8. **Node 5 (JSON Guardrail Formatter, `node5-guardrail.ts`):** Sends Node 3 + Node 4's combined output to OpenRouter to write a 10-field `ExecutiveSummary` (plain-language narrative for a business reviewer). The final `recommendation` is **not** produced by the LLM — it is computed deterministically by `determineRecommendation()` from the validated risk matrix, risk findings, and absence flags (see the Recommendation Engine section in `agents-plan.md`). Assembles the final `PipelineResult` (contract_status, metadata, clauses, obligations, absence_flags, risks, risk_matrix, summary, confidence, recommendation). Records `POL-FMT-001` (JSON-call succeeded), `POL-FMT-002` (schema-completeness gate — all 10 `ExecutiveSummary` fields populated), `POL-FMT-003` (temperature === 0 lock), `POL-FMT-004` (recommendation is one of the 6 valid enum values).
9. `runPipeline()` (`services/pipeline/index.ts`) saves a `status: 'running'` `ExecutionRecord` to `execution-store.ts` immediately, then re-saves the record after every node completes so a mid-run poll always sees the latest node outputs. On success it saves `status: 'done'` with `result` populated; **any** thrown error from any node is caught and persisted as `status: 'error'` with an error-shaped `NodeOutput` appended for whichever stage failed — the pipeline never lets an exception propagate into a 500.
10. The backend returns the full `ExecutionRecord` (200) whether the run succeeded or failed at some stage.
11. The frontend (`useContractAnalysis`) derives each node's status from `execution.nodes[].status` and renders `WorkflowCanvas` + `ResultPanel` (or an error banner if `result` is absent).
12. `governance.service.ts` and the continuous-learning service both read back from `execution-store.ts`, `governance-audit-store.ts`, and `trace-store.ts` to populate their dashboards — there are no separate write paths.

### File-upload path

1. The user picks a `.pdf`, `.docx`, or `.txt` file; analysis starts immediately (no separate "Run" click) via `analyzeContractFile()`.
2. `POST /api/v1/contracts/analyze-file` (multipart field `file`, `multer` memory storage, 15 MB limit) is handled by `analyzeContractFile` in `contract.controller.ts`.
3. `text-extraction.ts#extractTextFromFile` picks an extraction strategy by file extension (falling back to mimetype only when the extension is absent): `pdf-parse` for `.pdf`, `mammoth`'s `extractRawText` for `.docx`, a raw UTF-8 buffer read for `.txt`. Any other extension throws `Unsupported file type "<ext>"...` which the controller turns into a 400. An empty/whitespace-only extraction result (e.g. a scanned PDF with no OCR text layer) is also rejected with 400.
4. The controller SHA-256-hashes the extracted text and calls `executionStore.findByTextHash()`, which only matches **original** (non-duplicate) records.
   - **Duplicate found:** the controller clones the matched `ExecutionRecord` under a brand-new id, stamps `sourceFilename`, `textHash`, and `duplicateOfId` (pointing at the original), records a `pipeline` / `duplicate_upload_detected` audit event with outcome `Blocked`, saves it, and returns it immediately **without re-running the pipeline**.
   - **No duplicate:** `runPipeline(text, { sourceFilename, textHash })` runs normally and the resulting record carries `sourceFilename`/`textHash` for future dedup checks.

### Webhook path

External systems `POST /webhook` with `{ raw_text: string }` (or n8n-style `{ body: { raw_text: string } }` — both are accepted). `webhook.controller.ts#handleWebhook` calls the same `runPipeline()` used by the UI. No authentication is enforced on this route.

### Human review workflow

Once an `ExecutionRecord` exists, a reviewer can act on it through `review-store.ts` (an in-memory `Map<contractId, ReviewState>`) via 5 endpoints, all under `/api/v1/contracts/:id/...` and all guarded by a 404 lookup against `execution-store.ts` first:

- `GET /:id/review` — returns `{ execution, review }` (creates an empty `ReviewState` on first access).
- `PATCH /:id/review/metadata` — merges a partial `ContractMetadata` patch into `review.editedMetadata`; the UI calls this `onBlur` per field.
- `POST /:id/review/risk-decision` — records `accepted`/`rejected` against a specific `RiskFinding.id`; overwrites any prior decision for that id.
- `POST /:id/review/comment` — appends a timestamped `ReviewComment`.
- `POST /:id/review/decision` — records the final `approved`/`rejected`/`needs_revision` decision plus `decidedBy`/`decidedAt`.

Every one of these also writes a hash-chained audit event under agent `'reviewer'` (`metadata_edited`, `risk_decision_recorded`, `comment_added`, `final_decision_recorded`), so the human-in-the-loop workflow is itself part of the forensic trail, not a side channel. `governance.service.ts`'s "HITL queue" KPI is `reviewStore.countPendingDecisions()` over all `done` executions — i.e. completed analyses that have never received a final decision.

### Execution retrieval

`GET /api/v1/contracts/executions` returns the full list of `ExecutionRecord`s (newest first, capped at the in-memory store's 50-item circular buffer — there is no separate summary projection or pagination).
`GET /api/v1/contracts/executions/:id` returns a single full record, or 404.

---

## API Contract

All routes are mounted under the prefixes shown in `backend/src/routes/index.ts`. The frontend accesses them via the Vite dev proxy at `/proxy/service1`.

### POST /api/v1/contracts/analyze

**Request**
```json
{ "contract_text": "string, required, non-empty" }
```
**Response 200** — the full `ExecutionRecord` (see schema below), whether the pipeline succeeded or failed partway.
**Response 400**
```json
{ "error": "contract_text is required" }
```

### POST /api/v1/contracts/analyze-file

**Request:** `multipart/form-data`, field name `file` (`.pdf`, `.docx`, or `.txt`; ≤ 15 MB).
**Response 200** — the `ExecutionRecord`. If the extracted text's SHA-256 hash matches a prior, non-duplicate execution, the record is a clone of that prior result carrying `duplicateOfId` and the pipeline is **not** re-run.
**Response 400** — missing file, unsupported extension, or no extractable text (`{ "error": "..." }`); multer errors (e.g. oversize) are also surfaced as 400.

### POST /webhook

**Request**
```json
{ "raw_text": "string, required" }
```
(also accepts `{ "body": { "raw_text": "..." } }`)
**Response 200** — the full `ExecutionRecord`.
**Response 400**
```json
{ "error": "Missing raw_text in webhook payload" }
```

### GET /api/v1/contracts/executions

**Response 200** — `ExecutionRecord[]`, newest first, up to 50.

### GET /api/v1/contracts/executions/:id

**Response 200** — a single `ExecutionRecord`.
**Response 404** — `{ "error": "Execution not found" }`

### POST /api/v1/contracts/feedback

**Request**
```json
{ "stage": "string, required", "kind": "string, required", "contract_id": "string, optional", "data": { "...": "..." } }
```
**Response 200** — the stored feedback entry (delegates to `feedback-store.ts`).
**Response 400** — `stage` or `kind` missing.

### Human review endpoints

| Method + Path | Body | Response |
|---|---|---|
| `GET /api/v1/contracts/:id/review` | — | `{ execution, review }` or 404 |
| `PATCH /api/v1/contracts/:id/review/metadata` | `Partial<ContractMetadata>` | updated `ReviewState` |
| `POST /api/v1/contracts/:id/review/risk-decision` | `{ riskId, decision: "accepted"\|"rejected" }` | updated `ReviewState` (400 if fields missing/invalid) |
| `POST /api/v1/contracts/:id/review/comment` | `{ text, author? }` | updated `ReviewState` (400 if `text` blank) |
| `POST /api/v1/contracts/:id/review/decision` | `{ decision: "approved"\|"rejected"\|"needs_revision", decidedBy? }` | updated `ReviewState` (400 if `decision` invalid) |

### GET /api/v1/governance/*

`overview`, `audit`, `fleet`, `policies`, `compliance`, `slo` — all backed by real data derived from `execution-store.ts`, `governance-audit-store.ts`, and `review-store.ts` (see the Governance Dashboard section below). No endpoint returns a hardcoded/fixture number.

### GET /api/v1/continuous-learning/*

Unchanged surface (baselines, promoted experiments, config, feedback, timelines) backed by `continuous-learning.service.ts`, `agent-config.service.ts`, `trace-store.ts`, and `feedback-store.ts`. `recordTrace()` is called once per LLM-backed node (extractor, risk_evaluator, formatter) on both success and failure paths.

---

## AI Component Details

### Overview

Nodes 3, 4, and 5 each make exactly one call to the configured OpenRouter model (`OPENROUTER_MODEL`, default `google/gemma-4-26b-a4b-it:free`) through the shared `callJsonLLM()` helper in `backend/src/services/openai.ts`. There is no Anthropic SDK anywhere in the codebase. The `openai` client is an `OpenAI` SDK instance pointed at `baseURL: 'https://openrouter.ai/api/v1'`, authenticated with `OPENROUTER_API_KEY` (falls back to `OPENAI_API_KEY` if set, otherwise a startup warning is logged and calls will fail).

`callJsonLLM({ systemPrompt, userPrompt, temperature?, maxTokens? })`:
- Sends a `system` + `user` message pair to `openai.chat.completions.create()`.
- Strips a leading/trailing ```` ```json ... ``` ```` fence (or bare ```` ``` ... ``` ````) before parsing.
- On a `JSON.parse` failure, appends the bad assistant response plus a corrective user message ("Your last response was not valid JSON...") and retries — **up to 3 attempts total**.
- Throws after exhausting all attempts; each node's own `try/catch` turns that into a `status: 'error'` `ExecutionRecord` rather than an unhandled exception.

All calls are synchronous/non-streaming, since each pipeline stage needs the prior stage's full output before it can run.

---

### Node 3 — Extractor & Absence Agent (`node3-extractor.ts`)

| Parameter | Source | In-code fallback | **Effective value at runtime** |
|---|---|---|---|
| Model | `MODEL` (`OPENROUTER_MODEL`) | `google/gemma-4-26b-a4b-it:free` | same |
| Temperature | `agentConfigService.getValue('extractor', 'temperature', 0.1)` | `0.1` | `0.1` |
| Max tokens | `agentConfigService.getValue('extractor', 'max_tokens', 7000)` | `7000` | **`2500`** |
| Min input chars | `agentConfigService.getValue('extractor', 'min_input_chars', 50)` | `50` | `50` |

**Important:** `agent-config.service.ts`'s own `SEED_CONFIG` constant is empty, but `continuous-learning.service.ts` runs a `seedAgentConfig()` side effect at module-import time (i.e. once, at server startup, before any request is served — its route is always mounted in `routes/index.ts`) that promotes 11 namespaced values into the live config store, INCLUDING `extractor.max_tokens = 2500`, `risk.max_tokens = 1800`, and `formatter.max_tokens = 900`. Because a promoted value always wins over `getValue()`'s fallback argument, **these seeded values, not the larger literals hardcoded in the node files, are what nodes 3–5 actually use out of the box.** They're sized to comfortably fit the current schema (20 metadata fields + 15 clauses + obligations for the extractor; a risk list + 4-dimension matrix for risk; a 10-field executive summary for the formatter) while staying below each node's own generous fallback (7000/5000/3000), so a continuous-learning promotion that raises them further still has real, demonstrable room to improve. This is easy to miss because the two numbers live in different files (`node3-extractor.ts` vs. `continuous-learning.service.ts`).

**System prompt (verbatim structure):** instructs the model to return only a JSON object with `metadata` (20 named string/array fields), `clauses` (array, one entry required per each of the 15 `CLAUSE_CATEGORIES`, in a fixed order, each with `category`/`present`/`excerpt`), `obligations` (`party`/`category`/`description`, category constrained to `payment|delivery|reporting|notification|compliance|renewal|other`), and `absence_flags` (string array). It explicitly instructs: use the literal sentinel `"Not specified in contract"` for any metadata field not found (never omit the key), and never hallucinate parties/dates/amounts not present in the text.

**User message:** the sanitized/truncated text from Node 2.

**Guardrail behavior:** if the input is shorter than `min_input_chars`, the node throws before ever calling the LLM (`POL-EXT-001`, recorded as `Blocked`). If the LLM call itself fails (including exhausting `callJsonLLM`'s retries), the node records `extractor_run_completed` as `Blocked`, a failure trace, and throws — Node 4/5 never run. All coercion functions (`coerceMetadata`, `coerceClauses`, `coerceObligations`) are defensive: malformed/missing fields from the model are backfilled rather than causing a crash.

**Policy checks recorded (every run that reaches this node):**
- `POL-EXT-001` — input length ≥ `min_input_chars` (Blocked if not, before the call)
- `POL-EXT-002` — temperature-lock audit (recorded `Success` unconditionally — it is an audit note, not a live check)
- `POL-EXT-003` — max-token audit (same)

---

### Node 4 — Risk Matrix Evaluator (`node4-risk.ts`)

| Parameter | Source | In-code fallback | Effective value at runtime |
|---|---|---|---|
| Model | `MODEL` | `google/gemma-4-26b-a4b-it:free` | same |
| Temperature | `agentConfigService.getValue('risk', 'temperature', 0.1)` | `0.1` | `0.1` |
| Max tokens | `agentConfigService.getValue('risk', 'max_tokens', 5000)` | `5000` | **`1800`** (seeded — see Node 3 note above) |

**System prompt:** asks for `risks[]` (category/title/severity `low|medium|high`/explanation/related_clause — every risk must cite a concrete field/clause/absence-flag that triggered it, never a generic template sentence), a `risk_matrix` (`commercial`/`legal`/`operational`/`compliance`/`overall_score`, each 0–10, where `overall_score` reflects overall risk holistically rather than a plain average), and `risk_detection_confidence` (0–1 self-estimate). Named risk patterns it's told to consider include uncapped liability, one-sided/missing indemnification, missing confidentiality/dispute-resolution/governing-law, vague notice periods, silent-renewal traps, undefined SLAs, and missing data-protection/insurance clauses.

**User message:** the full JSON output of Node 3.

**Confidence scores it also computes (not LLM output):** `extraction` and `clause_identification` are computed deterministically in this file from Node 3's own output — `extraction` = fraction of the 20 metadata fields that aren't the "not found" sentinel; `clause_identification` = fraction of the 15 clauses that are either present-with-an-excerpt or cleanly absent. `risk_detection` is the model's self-reported `risk_detection_confidence`, clamped to `[0, 1]`.

**Policy checks recorded:**
- `POL-RISK-001` — all 5 risk-matrix scores fall in `[0, 10]` (`Blocked` if not, recorded after coercion/clamping)
- `POL-RISK-002` — every risk's severity is one of `low|medium|high` (`Blocked` if not)
- `POL-RISK-003` — audit note confirming thresholds are sourced from `agentConfigService`, not inlined constants (always `Success`)
- `POL-RISK-004` — temperature ≤ 0.3 (`Blocked` if the configured temperature exceeds 0.3)

---

### Node 5 — JSON Guardrail Formatter (`node5-guardrail.ts`)

| Parameter | Source | In-code fallback | Effective value at runtime |
|---|---|---|---|
| Model | `MODEL` | `google/gemma-4-26b-a4b-it:free` | same |
| Temperature | `agentConfigService.getValue('formatter', 'temperature', 0)` | `0` | `0` (not seeded, falls through) |
| Max tokens | `agentConfigService.getValue('formatter', 'max_tokens', 3000)` | `3000` | **`900`** (seeded — see Node 3 note above) |
| Low-risk max score | `agentConfigService.getValue('formatter', 'low_risk_max_score', 3.0)` | `3.0` | `3.0` (not seeded) |
| Moderate-risk max score | `agentConfigService.getValue('formatter', 'moderate_risk_max_score', 6.5)` | `6.5` | `6.5` (not seeded) |

**System prompt:** the LLM writes only the 10-field `ExecutiveSummary` (`purpose`, `parties`, `commercial_overview`, `key_dates`, `financial_commitments`, `major_obligations`, `significant_risks`, `important_clauses`, `recommended_next_steps`, `narrative`) — 1–3 plain-language sentences per field grounded only in the supplied data, plus a 4–6 sentence standalone `narrative`. It is explicitly told **not** to restate a formal recommendation code, because that is computed separately.

**User message:** Node 3's output merged with Node 4's `risks`/`risk_matrix`.

**The recommendation is deterministic, not LLM-generated.** `determineRecommendation(extractorOutput, riskOutput)` computes one of the 6 `Recommendation` values by walking these branches in order:

1. `risk_matrix.overall_score >= 8` OR 2+ high-severity risk findings → `HIGH_RISK_IMMEDIATE_REVIEW`
2. else, if 2 or more of `{parties empty, effective_date not found, contract_value not found}` are true → `REQUEST_MISSING_INFORMATION`
3. else, if an absence flag matches `/governing law|dispute resolution|liability|indemnif/i` OR `risk_matrix.legal >= 6` → `LEGAL_REVIEW_REQUIRED`
4. else, if `risk_matrix.commercial >= 6` → `PROCUREMENT_REVIEW_REQUIRED`
5. else, if there are any absence flags, or exactly 1 high-severity risk, or `overall_score >= 4` → `MINOR_REVISIONS_RECOMMENDED`
6. else → `READY_FOR_REVIEW`

`contract_status` (`low_risk`/`moderate_risk`/`high_risk`) is a separate, simpler deterministic bucketing of `risk_matrix.overall_score` against the two configurable thresholds above.

Final `confidence.summary` and `confidence.overall` are also computed here (not by the LLM): `summary` blends the fraction of summary fields that weren't the "Not available." fallback with the extraction/clause confidences; `overall` is the mean of all four upstream confidence scores plus `summary`.

**Policy checks recorded:**
- `POL-FMT-001` — the OpenRouter call for the summary succeeded (`Blocked` on any error, with the node then throwing)
- `POL-FMT-002` — schema-completeness gate: all 10 `ExecutiveSummary` fields are populated (not left at the `"Not available."` fallback) (`Blocked` otherwise)
- `POL-FMT-003` — temperature === 0 exactly (`Blocked` otherwise)
- `POL-FMT-004` — the computed `recommendation` is one of the 6 valid enum values (`VALID_RECOMMENDATIONS`)

All four `POL-FMT-*` rules defined in `governance.service.ts`'s static policy table are recorded by this node — the formatter has four rules, not three.

---

### Prompt Strategy Summary

- All three system prompts specify "respond with ONLY a single JSON object (no markdown fences, no commentary)" to minimize preamble; `callJsonLLM` also strips fences defensively and retries on parse failure.
- Node 3/4 temperature defaults to `0.1`; Node 5's summary call defaults to `0` for determinism (the final recommendation is deterministic code regardless of temperature).
- Token budgets are read from `agentConfigService`, not hardcoded per-node constants — they can be changed at runtime via the continuous-learning promotion flow without a redeploy. In this build's default state the effective budgets are 2500 / 1800 / 900 tokens (extractor / risk / formatter), because `continuous-learning.service.ts` seeds those exact values into the config store at startup; the larger literals visible in the node files (7000 / 5000 / 3000) are dormant fallbacks that would only apply if that seed were removed.
- No streaming is used anywhere in the pipeline.
- Every node runs against the same 60,000-character (post-truncation) contract text budget set by Node 2; there is no separate context-window accounting per node beyond the `max_tokens` output caps above.

---

## Vector DB

No vector database is used. Contract analysis is a single-pass structured-extraction-then-scoring task over the full (possibly truncated) contract text; there is no retrieval step and no clause-library similarity search in the current implementation.

---

## Data Model Reference

See `backend/src/types/contract.ts` for the authoritative types. Key shapes:

- **`ContractMetadata`** (20 fields): `title`, `agreement_type`, `parties: string[]`, `effective_date`, `expiration_date`, `renewal_date`, `duration`, `governing_law`, `jurisdiction`, `payment_terms`, `payment_schedule`, `currency`, `contract_value`, `notice_period`, `termination_conditions`, `renewal_conditions`, `confidentiality_requirements`, `ip_ownership`, `deliverables`, `service_levels`. Unfound fields hold the literal sentinel `"Not specified in contract"` (`NOT_FOUND`), never `null`/omitted.
- **`CLAUSE_CATEGORIES`** (15, fixed order): Confidentiality, Intellectual Property, Limitation of Liability, Indemnification, Termination, Force Majeure, Data Protection, Payment Terms, Warranty, Service Levels, Change Management, Governing Law, Dispute Resolution, Assignment, Insurance Requirements.
- **`ClauseFinding`**: `{ category, present: boolean, excerpt? }`.
- **`Obligation`**: `{ party, category: ObligationCategory, description }` where `ObligationCategory` is `payment|delivery|reporting|notification|compliance|renewal|other`.
- **`RiskFinding`**: `{ id, category, title, severity: RiskSeverity, explanation, related_clause? }`; `RiskSeverity` is `low|medium|high`.
- **`RiskMatrix`**: `{ commercial, legal, operational, compliance, overall_score }`, each `0–10`.
- **`ExecutiveSummary`** (10 fields, all strings): `purpose`, `parties`, `commercial_overview`, `key_dates`, `financial_commitments`, `major_obligations`, `significant_risks`, `important_clauses`, `recommended_next_steps`, `narrative`.
- **`ConfidenceScores`** (5 fields, each `0–1`): `extraction`, `clause_identification`, `risk_detection`, `summary`, `overall`.
- **`Recommendation`** — 6-value enum: `READY_FOR_REVIEW | MINOR_REVISIONS_RECOMMENDED | LEGAL_REVIEW_REQUIRED | PROCUREMENT_REVIEW_REQUIRED | HIGH_RISK_IMMEDIATE_REVIEW | REQUEST_MISSING_INFORMATION`.
- **`PipelineResult`**: `{ contract_status, metadata, clauses, obligations, absence_flags, risks, risk_matrix, summary, confidence, recommendation }`.
- **`RiskDecision`** = `'accepted' | 'rejected'`; **`ReviewComment`** = `{ id, text, author?, ts }`; **`ReviewState`** = `{ contractId, editedMetadata: Partial<ContractMetadata>, riskDecisions: Record<string, RiskDecision>, comments: ReviewComment[], finalDecision?, decidedBy?, decidedAt? }`.
- **`ExecutionRecord`**: `{ id, contractId, startedAt, completedAt?, status: 'running'|'done'|'error', nodes: NodeOutput[], result?: PipelineResult, error?, rawTextExcerpt?, durationMs?, sourceFilename?, textHash?, duplicateOfId?, truncated? }`.

---

## Execution Store (in-memory)

`backend/src/services/execution-store.ts` wraps a `Map<string, ExecutionRecord>` plus an insertion-order array, capped at **50** records (oldest evicted first; re-saving an existing id does not consume a slot). Helper methods used elsewhere in the app: `save`, `get`, `list` (newest-first), `count`, `countByStatus`, `findByTextHash` (only matches originals — records with `duplicateOfId` set are excluded, so duplicate chains always resolve back to the first real analysis), and `stageCounts()` (per-node completion counts across all stored executions, used by the governance overview's pipeline funnel).

---

## Frontend State (per pipeline run)

`useContractAnalysis` (`frontend/src/hooks/useContractAnalysis.ts`) exposes:

```typescript
interface AnalysisState {
  isRunning: boolean
  execution: ExecutionRecord | null
  nodeStates: Record<string, NodeStatus>   // keyed by stepId, e.g. "Extractor_and_Absence_Agent"
  error: string | null
}
```

`run(contractText)` calls `POST /api/v1/contracts/analyze`; `runFile(file)` calls `POST /api/v1/contracts/analyze-file` with a `FormData` body. Both set `isRunning: true` immediately, then on response derive `nodeStates` from `execution.nodes[].status` and surface `execution.error` if the pipeline failed partway. There is no server-sent-events or polling layer — the whole pipeline runs synchronously within the single HTTP request, and `WorkflowCanvas` infers a "running" node visually (the first pipeline-defined node without a completed status) only while `isRunning` is true and no execution has come back yet.

`ResultPanel` additionally fetches `GET /:id/review` on every new result and drives the 4 review-mutation calls (`updateReviewMetadata`, `setRiskDecision`, `addReviewComment`, `setFinalDecision`) directly against the API, refreshing its local `ReviewState` from each response.
