# express-ts

A production-ready Express 5 + TypeScript boilerplate managed with pnpm. Includes Helmet, Morgan, CORS, and a layered architecture mirroring the FastAPI template.

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 22 |
| pnpm | 11 |

## Ports

| Service | Default port | Env var |
|---|---|---|
| Express server | **4000** | `PORT` |

Frontend templates proxy to this service at `/proxy/service2/*` (Vite) or via Next.js rewrites.

## Setup

```bash
cp .env.example .env
pnpm install
```

## Development

```bash
pnpm dev
# Server starts on http://localhost:4000 with hot-reload via tsx
```

## Tests

```bash
pnpm test
# Vitest + supertest: 8 tests pass (health + items CRUD)
```

## Build

```bash
pnpm build   # compiles TypeScript → dist/
pnpm start   # runs dist/server.js
```

## Docker

Multi-stage build — builder compiles TypeScript, production stage installs only prod dependencies.

```bash
docker build -t express-ts .

docker run -p 4000:4000 \
  -e CORS_ORIGINS="http://localhost:3000,http://localhost:5173" \
  -e NODE_ENV=production \
  express-ts
```

In a `docker-compose.yml` stack:

```yaml
services:
  express:
    build: ./templates/express-ts
    ports: ["4000:4000"]
    environment:
      CORS_ORIGINS: "http://frontend:3000"
      NODE_ENV: production
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe — returns `{ status, timestamp }` |
| GET | `/api/v1/items` | List all items |
| GET | `/api/v1/items/:id` | Get item by ID |
| POST | `/api/v1/items` | Create item (`{ name, description? }`) |
| PUT | `/api/v1/items/:id` | Update item |
| DELETE | `/api/v1/items/:id` | Delete item |

## Governance API

Read-only endpoints mounted under `/api/v1/governance`. They serve in-memory
fixtures that back the governance dashboard UI — no database or external calls.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/governance/overview` | Headline KPIs, policy decisions, breach alerts, pipeline funnel, recent activity |
| GET | `/api/v1/governance/audit` | Audit trail rows plus per-row forensic details (`{ rows, details }`) |
| GET | `/api/v1/governance/fleet` | Pipelines with agent identities and the tenant tool pool (`{ pipelines, allTenantTools }`) |
| GET | `/api/v1/governance/policies` | Policy rules, blocked-pattern categories, confidence gates (`{ rules, blockedPatterns, confidenceGates }`) |
| GET | `/api/v1/governance/compliance` | OWASP ASI control coverage and items needing attention |
| GET | `/api/v1/governance/slo` | Per-stage P95 latency targets, error budget, and 24h trend |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port Express listens on | `4000` |
| `CORS_ORIGINS` | Comma-separated allowed origins | (required for browser clients) |
| `NODE_ENV` | `development` or `production` | `development` |

> **CORS note**: set `CORS_ORIGINS` to the exact origin of your frontend.
> When the frontend uses `/proxy/node/*` rewrites, CORS is handled by the
> frontend server — you can set `CORS_ORIGINS=*` safely in that case.

## Project Structure

```
src/
├── app.ts          Express app factory — middleware stack + route registration
├── server.ts       Entry point: binds to PORT (never import in tests)
├── config.ts       Typed dotenv config (port, corsOrigins, nodeEnv)
├── routes/         Route definitions (thin — just method + path + controller)
├── controllers/    Request handlers (parse input, call service, send response)
├── services/       Business logic + in-memory Map store
├── middleware/     errorHandler (4-arg), notFound (404 fallback)
└── types/          Shared TypeScript interfaces (Item, DTOs, responses)
```
