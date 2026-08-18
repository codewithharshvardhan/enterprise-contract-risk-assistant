# Enterprise Contract Risk Assistant

A 5-node AI pipeline that ingests a contract (pasted text or an uploaded PDF/DOCX/TXT file), extracts structured legal facts, evaluates multi-dimensional risk, generates an executive summary, and produces a schema-validated JSON verdict with a human-in-the-loop review workflow and a governance/audit dashboard — powered by an OpenRouter-hosted LLM.

## Architecture

```
Node 1: Webhook Trigger              validates the raw_text payload
Node 2: Text Formatter               sanitizes, normalizes, truncates (60,000 char cap)
Node 3: Extractor & Absence Agent    LLM call — metadata, 15 clause categories, obligations, absence flags
Node 4: Risk Matrix Evaluator        LLM call — commercial/legal/operational/compliance risk + named findings
Node 5: JSON Guardrail Formatter     LLM call — executive summary + deterministic recommendation + validation
```

Every LLM call goes through a shared `callJsonLLM()` helper (retries up to 3 times with a self-correction message on invalid JSON) and every real pipeline run writes deterministic policy-check events into a hash-chained audit trail — this is what makes the governance dashboard's numbers real rather than fixture data. See `docs/architecture-overview.md` and `docs/ai-workflow-and-design-decisions.md` for the full design rationale.

## Prerequisites

- Node.js 18+ and npm
- An [OpenRouter](https://openrouter.ai/keys) API key (OpenRouter proxies many models, including free-tier ones, behind one OpenAI-compatible API)

## Setup

This is an npm workspace — one install at the repo root covers both `backend/` and `frontend/`.

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set OPENROUTER_API_KEY=sk-or-...
npm install
```

## Running Locally

```bash
npm run dev
```

This starts the backend (port 4000) and frontend (Vite dev server, port 5173) together. To run just one:

```bash
npm run dev:backend
npm run dev:frontend
```

Open **http://localhost:5173** in your browser. The backend health endpoint is at **http://localhost:4000/health**.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key — powers Nodes 3, 4, and 5 |
| `OPENROUTER_MODEL` | No | Model slug (default `google/gemma-4-26b-a4b-it:free`). OpenRouter's free-tier lineup changes over time and free models are rate-limited per day — check [openrouter.ai/models](https://openrouter.ai/models) if the default is unavailable or you hit a `429` |
| `PORT` | No | Backend port (default `4000`) |

See `backend/.env.example` for the full list. **Never commit a real key** — `.env` is git-ignored; `.env.example` files must only ever contain blank placeholders.

## API Reference

### Analyze pasted text

```
POST /api/v1/contracts/analyze
Content-Type: application/json

{ "contract_text": "<full contract text>" }
```

### Analyze an uploaded file

```
POST /api/v1/contracts/analyze-file
Content-Type: multipart/form-data

file=<contract.pdf | contract.docx | contract.txt>
```

Both return an `ExecutionRecord` with node-by-node status and, on success, the final `PipelineResult`. Uploads are SHA-256 hashed for duplicate detection — re-uploading the same content short-circuits the pipeline and tags the new record with `duplicateOfId`.

### Webhook trigger

```
POST /webhook
Content-Type: application/json

{ "raw_text": "<full contract text>" }
```

### Executions

```
GET /api/v1/contracts/executions
GET /api/v1/contracts/executions/:id
```

### Human review workflow

```
GET   /api/v1/contracts/:id/review                    merged execution + review state
PATCH /api/v1/contracts/:id/review/metadata            edit an extracted field
POST  /api/v1/contracts/:id/review/risk-decision       { riskId, decision: "accepted"|"rejected" }
POST  /api/v1/contracts/:id/review/comment             { text, author? }
POST  /api/v1/contracts/:id/review/decision            { decision: "approved"|"rejected"|"needs_revision", decidedBy? }
```

Every review action is recorded in the governance audit trail under agent `reviewer`.

### Governance & audit

```
GET /api/v1/governance/overview     KPIs, policy decisions, breach alerts, pipeline funnel
GET /api/v1/governance/audit        hash-chained audit log
GET /api/v1/governance/fleet        agent fleet/trust status
GET /api/v1/governance/policies     policy rules + real fire counts
GET /api/v1/governance/compliance   OWASP ASI control coverage + evidence
GET /api/v1/governance/slo          per-stage P95 latency targets vs. observed
```

## Running Tests

```bash
npm test
```

112 backend tests across the pipeline nodes, both `/analyze` and `/analyze-file` endpoints (including duplicate detection), the review workflow, text extraction, the `callJsonLLM` retry logic, the execution store, the governance service's dynamic derivation logic, and the Continuous Learning engine, plus the frontend's own test suite.

## Build for Production

```bash
npm run build
node backend/dist/server.js
# Serve frontend/dist/ with any static file server
```

## Governance & Continuous Learning

- **Governance dashboard** — `/governance` (UI) and `/api/v1/governance` (API). All KPIs, policy fire counts, and OWASP ASI compliance evidence are computed live from the hash-chained audit trail and the review/execution stores — nothing is hardcoded. A control with no rules implemented grades `none`; a control with rules that haven't fired yet grades `weak`; only real enforcement evidence earns `strong`.
- **Continuous Learning** — `/continuous-learning` (UI) and `/api/v1/continuous-learning` (API). Tracks 4 quality targets (`extraction_completeness`, `risk_score_calibration`, `json_validity_rate`, `recommendation_consistency`), captures human feedback and agent traces, detects drift, proposes experiments, and gates promotions.

## Sample Contracts & Demo

- `sample-contracts/` — 5 original, fictitious contracts (NDA, MSA, vendor agreement, consulting SOW, software license) with varying risk profiles for demoing the full pipeline.
- `docs/demo-video-script.md` — a walkthrough script covering upload → extraction → clauses → risks → summary → confidence → recommendation → review actions → audit trail → governance dashboard.
- `docs/assumptions-limitations-future-enhancements.md` — known limitations (in-memory persistence, OpenRouter free-tier rate limits, single-model reliance) and where this would go next.

## Project Structure

```
.
├── backend/                     Express + TypeScript backend
│   └── src/
│       ├── services/
│       │   ├── pipeline/        5-node contract pipeline
│       │   ├── openai.ts        OpenRouter client + shared callJsonLLM() helper
│       │   ├── review-store.ts  In-memory human-review state
│       │   ├── text-extraction.ts  PDF/DOCX/TXT → plain text
│       │   ├── governance.service.ts   Dynamic KPI/policy/compliance derivation
│       │   └── cl-engine/       Continuous Learning loop
│       └── controllers/
├── frontend/                    React + Vite + TypeScript frontend
│   └── src/
│       ├── components/
│       │   ├── workflow/        Visual 5-node canvas
│       │   └── contract/        Input + review/result panels
│       └── pages/
├── docs/                        Architecture, AI design decisions, limitations, demo script
├── sample-contracts/            5 fictitious sample contracts for demoing
├── build.config.json            Production build metadata
└── backend/.env.example         Environment variable names (blank placeholders only)
```
