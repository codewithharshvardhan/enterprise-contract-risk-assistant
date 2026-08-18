# Enterprise Contract Risk Workflow — spec.md

## Project Overview and Goals

The Enterprise Contract Risk Workflow is a full-stack web application that automates legal and business contract review through a deterministic five-node AI analysis pipeline. Users paste raw contract text into a visual interface, trigger the analysis, and receive a structured JSON risk report within seconds. The application exposes the same pipeline as both a webhook endpoint (for automated ingestion from external systems) and a direct REST API (for frontend and programmatic callers).

The core goal is to replace slow, manual contract-review cycles with a reproducible, auditable pipeline that extracts metadata, identifies missing clauses, scores risk across standard dimensions, and emits clean machine-readable JSON — while giving operators full visibility through governance and continuous-learning surfaces.

## Target Users

- Legal operations teams who review high volumes of vendor and partner contracts.
- Procurement and compliance officers who need rapid risk triage before human legal review.
- Developer integrators who want to POST contracts from document-management or e-signature systems and receive structured analysis automatically.
- AI/ML operators who monitor pipeline health and tune model behaviour through the governance and continuous-learning dashboards.

## Core Features

1. Five-node sequential pipeline: Webhook receiver → Text sanitiser → Extractor and absence detector → Risk matrix evaluator → JSON guardrail formatter.
2. Visual workflow canvas: animated node cards showing real-time status (idle / running / done / error) and truncated output previews with connectors.
3. Contract input panel: multi-line text area, "Run Analysis" trigger button, and webhook URL display for external POST calls.
4. Final result panel: colour-coded JSON viewer with per-dimension risk scores (1–5) and a recommended action.
5. Recent executions list with click-through to per-execution detail.
6. Node detail modal: full raw output for any node in any execution.
7. Execution store: in-memory circular buffer capped at 50 entries, keyed by UUID.
8. Governance dashboard (from template — `/governance` UI, `/api/v1/governance` API): wired with pipeline-stage funnel, policy decisions, and audit rows drawn from contract analysis activity.
9. Continuous Learning workspace (from template — `/continuous-learning` UI, `/api/v1/continuous-learning` API): baselines inferred from real extraction and risk-score feedback; resolvers and candidate scorers registered for accuracy and risk-calibration metrics.

---

## Tech Stack — Frontend

**React 18 + Vite 5 + TypeScript** via the `vite-react-ts` scaffold in `frontend/`.

Justification:
- Vite provides fast HMR and a zero-config dev server with a built-in reverse-proxy to the backend, keeping CORS complexity off the browser.
- React's component model maps cleanly to the three-panel layout (input / canvas / result) and the node-card state machine (idle → running → done/error).
- TypeScript strict mode ensures the pipeline node output shapes are enforced at compile time across API client, state, and rendering.
- Tailwind CSS (already present in the scaffold) provides utility-first styling without a separate build step.
- No external graph/canvas library is needed; node cards are rendered as positioned `div` elements inside a flex container and SVG `<line>` elements connect them, keeping the bundle small and the animation purely CSS-driven.

Key libraries added to the scaffold:
- No new major dependencies beyond the scaffold defaults. Animation is CSS keyframes; API calls use the native `fetch` already wired in `src/lib/api.ts`.

---

## Tech Stack — Backend

**Node 20 + Express 5 + TypeScript** via the `express-ts` scaffold in `backend/`.

Justification:
- Express is minimal, well-understood by the team, and pairs naturally with the async sequential pipeline pattern.
- `@anthropic-ai/sdk` (Anthropic's official Node SDK) is the only external AI dependency — it handles retry logic, streaming, and type-safe message construction for the three Claude nodes.
- `uuid` generates stable execution IDs without a database dependency.
- The in-memory circular buffer satisfies the "last 50 executions" requirement with zero operational overhead; the existing `InMemoryStore` generic from `src/db/database.ts` is reused as-is.
- The governance and continuous-learning scaffolding already exists and only needs wiring to real execution and feedback data.

Key libraries added to the scaffold:
- `@anthropic-ai/sdk` — Claude API client.
- `uuid` — execution ID generation.
- `express-async-errors` — propagates rejected promises from async route handlers to the central `errorHandler` middleware without wrapper boilerplate.

---

## File / Directory Tree

Legend: `[exists]` = already in the scaffold, `[modify]` = scaffold file that must be updated, `[add]` = new file to create.

```
<workspace root>/
├── spec.md                                          [add — this file]
├── arch.md                                          [add]
├── README.md                                        [add]
├── .env.example                                     [add — root-level, references both services]
├── integrations-config.json                         [add]
├── preview.config.json                              [add]
├── build.config.json                                [add — after preview is healthy]
│
├── frontend/                                        [exists — vite-react-ts scaffold]
│   ├── package.json                                 [modify — rename to "enterprise-contract-risk-frontend"]
│   ├── index.html                                   [modify — update <title>]
│   ├── vite.config.ts                               [exists — no change needed]
│   ├── tsconfig.json                                [exists]
│   ├── tailwind.config.ts                           [exists]
│   ├── .env.example                                 [exists — no change needed]
│   ├── src/
│   │   ├── main.tsx                                 [exists — no change needed]
│   │   ├── index.css                                [exists — no change needed]
│   │   ├── App.tsx                                  [modify — add /analyze and /executions routes]
│   │   ├── vite-env.d.ts                            [exists]
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts                             [modify — add pipeline and execution types]
│   │   │   └── contract.ts                          [add — NodeStatus, NodeOutput, Execution, RiskScore types]
│   │   │
│   │   ├── pages/
│   │   │   ├── HomePage.tsx                         [modify — replace placeholder with link to analyzer]
│   │   │   ├── AnalyzePage.tsx                      [add — three-panel layout: input / canvas / result]
│   │   │   ├── ExecutionsPage.tsx                   [add — recent executions list]
│   │   │   ├── AboutPage.tsx                        [exists — no change needed]
│   │   │   ├── NotFoundPage.tsx                     [exists — no change needed]
│   │   │   ├── governance/                          [exists — no change needed]
│   │   │   └── continuous-learning/                 [exists — no change needed]
│   │   │
│   │   ├── components/
│   │   │   ├── Header.tsx                           [modify — add Analyze and Executions nav links]
│   │   │   ├── Footer.tsx                           [exists — no change needed]
│   │   │   ├── workflow/
│   │   │   │   ├── WorkflowCanvas.tsx               [add — SVG-connected node card container]
│   │   │   │   ├── NodeCard.tsx                     [add — single node card with status indicator]
│   │   │   │   ├── NodeConnector.tsx                [add — animated SVG line between nodes]
│   │   │   │   └── NodeDetailModal.tsx              [add — full output modal overlay]
│   │   │   ├── contract/
│   │   │   │   ├── ContractInputPanel.tsx           [add — textarea + Run button + webhook URL]
│   │   │   │   └── ResultPanel.tsx                  [add — JSON viewer with risk colour coding]
│   │   │   ├── executions/
│   │   │   │   └── ExecutionList.tsx                [add — list of recent executions]
│   │   │   ├── governance/                          [exists — no change needed]
│   │   │   └── continuous-learning/                 [exists — no change needed]
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWindowSize.ts                     [exists]
│   │   │   ├── useContractAnalysis.ts               [add — manages pipeline run state + polling]
│   │   │   └── useExecutions.ts                     [add — fetches and caches execution list]
│   │   │
│   │   └── lib/
│   │       ├── api.ts                               [modify — add contract and execution API calls]
│   │       ├── governance/                          [exists — no change needed]
│   │       └── continuous-learning/                 [exists — no change needed]
│
└── backend/                                         [exists — express-ts scaffold]
    ├── package.json                                 [modify — rename + add @anthropic-ai/sdk, uuid, express-async-errors]
    ├── tsconfig.json                                [exists]
    ├── .env.example                                 [modify — add ANTHROPIC_API_KEY]
    ├── src/
    │   ├── app.ts                                   [modify — mount contract and webhook routers]
    │   ├── config.ts                                [modify — add ANTHROPIC_API_KEY field]
    │   ├── server.ts                                [exists — no change needed]
    │   │
    │   ├── types/
    │   │   ├── index.ts                             [modify — add pipeline + execution types]
    │   │   ├── contract.ts                          [add — NodeOutput, ExecutionRecord, RiskScore, PipelineResult]
    │   │   ├── governance.ts                        [exists — no change needed]
    │   │   └── continuous-learning.ts               [exists — no change needed]
    │   │
    │   ├── routes/
    │   │   ├── index.ts                             [modify — mount /webhook, /api/analyze, /api/executions]
    │   │   ├── contract.route.ts                    [add — /api/analyze and /api/executions routes]
    │   │   ├── webhook.route.ts                     [add — POST /webhook route]
    │   │   ├── health.route.ts                      [exists]
    │   │   ├── items.route.ts                       [exists]
    │   │   ├── governance.route.ts                  [exists]
    │   │   └── continuous-learning.route.ts         [exists]
    │   │
    │   ├── controllers/
    │   │   ├── contract.controller.ts               [add — analyze + executions handlers]
    │   │   ├── webhook.controller.ts                [add — webhook POST handler]
    │   │   ├── governance.controller.ts             [modify — wire real execution audit rows]
    │   │   ├── continuous-learning.controller.ts    [exists — no change needed]
    │   │   ├── items.controller.ts                  [exists — no change needed]
    │   │   └── health.controller.ts                 [exists — no change needed]
    │   │
    │   ├── services/
    │   │   ├── pipeline/
    │   │   │   ├── index.ts                         [add — runPipeline() orchestrator, exports ExecutionRecord]
    │   │   │   ├── node1-webhook.ts                 [add — Node_1_Webhook: raw payload acceptance]
    │   │   │   ├── node2-input.ts                   [add — Node_2_Contract_Input: sanitise + truncate]
    │   │   │   ├── node3-extractor.ts               [add — Extractor_and_Absence_Agent: Claude call]
    │   │   │   ├── node4-risk.ts                    [add — Risk_Matrix_Evaluator: Claude call]
    │   │   │   └── node5-guardrail.ts               [add — JSON_Guardrail_Formatter: Claude call]
    │   │   ├── execution-store.ts                   [add — circular buffer, max 50, keyed by UUID]
    │   │   ├── claude.ts                            [add — shared Anthropic client singleton]
    │   │   ├── governance.service.ts                [modify — replace static pipeline_funnel with real execution data]
    │   │   ├── continuous-learning.service.ts       [modify — register resolvers and scorers for extraction accuracy]
    │   │   ├── cl-engine/                           [exists — no change needed]
    │   │   ├── baselines-store.ts                   [exists]
    │   │   ├── feedback-store.ts                    [exists]
    │   │   ├── trace-store.ts                       [exists]
    │   │   ├── agent-config.service.ts              [exists]
    │   │   └── items.service.ts                     [exists]
    │   │
    │   ├── middleware/
    │   │   ├── errorHandler.ts                      [exists]
    │   │   └── notFound.ts                          [exists]
    │   │
    │   └── db/
    │       └── database.ts                          [exists — used by CL and governance; no change needed]
    │
    └── scripts/
        └── validate-agent-config.ts                [exists]
```

---

## Environment Variables

### Backend (`backend/.env.example`)

| Variable | Purpose | Required |
|---|---|---|
| `PORT` | Express listen port (default `4000`) | Yes |
| `NODE_ENV` | `development` or `production` | Yes |
| `CORS_ORIGINS` | Comma-separated list of allowed origins | No (defaults to localhost) |
| `DATABASE_URL` | Connection string for persistent store replacement | No |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude claude-sonnet-4-6 calls in nodes 3, 4, and 5 | Yes |

### Frontend (`frontend/.env.example`)

| Variable | Purpose | Required |
|---|---|---|
| `PORT` | Vite dev server port (default `5173`) | No |
| `BACKEND_1_URL` | Backend service URL — injected by preview orchestrator | No |
| `BACKEND_1_PORT` | Backend service port — injected by preview orchestrator | No |
| `VITE_PROD_BACKEND_1_URL` | Production backend URL for browser-side fetch | No |

### Runtime injection by preview orchestrator

The preview orchestrator injects `BACKEND_1_URL` (and `BACKEND_1_PORT`) into the frontend service environment so `vite.config.ts` can proxy `/proxy/service1/*` to the backend. The frontend uses `/proxy/service1` as its API base path during preview.
