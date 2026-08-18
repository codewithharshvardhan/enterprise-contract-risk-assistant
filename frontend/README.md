# vite-react-ts

A production-ready Vite 8 + React 19 + TypeScript SPA with Tailwind CSS v4, React Router v7, and a dev-proxy to multiple backend services.

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 22 |
| npm | 10 |

## Ports

| Service | Default port | Env var |
|---|---|---|
| Vite dev server | **5173** | `PORT` |
| Backend 1 (proxied) | 8000 | `BACKEND_1_URL` |
| Backend 2 (proxied) | 4000 | `BACKEND_2_URL` |

## Setup

```bash
cp .env.example .env
# Edit .env: set BACKEND_1_URL and BACKEND_2_URL to your service addresses
npm install
```

## Development

```bash
npm run dev
# http://localhost:5173
```

Vite's built-in reverse proxy routes requests at dev time:

| Path prefix | Forwarded to |
|---|---|
| `/proxy/service1/*` | `BACKEND_1_URL` (default `http://localhost:8000`) |
| `/proxy/service2/*` | `BACKEND_2_URL` (default `http://localhost:4000`) |

The prefix is stripped before forwarding, so `/proxy/service1/api/items` hits `{BACKEND_1_URL}/api/items`.

## Using the API clients

```typescript
import { service1Client, service2Client } from './lib/api'

const items  = await service1Client.get('/api/items')
const status = await service2Client.get('/health')
```

Import the default export when you only need one backend:

```typescript
import api from './lib/api'   // points to service1Client
```

## Production

In production the Vite dev server (and its proxy) does not run. Two options:

**Option A — reverse proxy in front of the bundle** (recommended)
Route `/proxy/service1/*` and `/proxy/service2/*` in nginx / Caddy to the real backends. No code change needed.

**Option B — absolute URLs baked into the build**
Populate `VITE_PROD_BACKEND_1_URL` and `VITE_PROD_BACKEND_2_URL` before building:

```bash
VITE_PROD_BACKEND_1_URL=https://api.example.com npm run build
```

## Build

```bash
npm run build   # output: dist/
```

## Tests

```bash
npm test   # Vitest: 2 tests pass
```

## Docker

```bash
docker build -t vite-react-ts .
docker run -p 8080:80 vite-react-ts
```

The image uses nginx and serves the static bundle. Wire up `/proxy/service*` routes in your nginx config (or load balancer) to point at your backends.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Vite dev server port | `5173` |
| `BACKEND_1_URL` | Target for `/proxy/service1/*` (dev proxy, server-side) | `http://localhost:8000` |
| `BACKEND_2_URL` | Target for `/proxy/service2/*` (dev proxy, server-side) | `http://localhost:4000` |
| `VITE_PROD_BACKEND_1_URL` | Service 1 URL baked into production build | — |
| `VITE_PROD_BACKEND_2_URL` | Service 2 URL baked into production build | — |

## Project Structure

```
src/
├── components/   Shared UI components (Header, Footer)
├── hooks/        Custom React hooks
├── lib/api.ts    Axios clients: service1Client, service2Client
├── pages/        Route-level page components
└── types/        Shared TypeScript interfaces
```

## Governance dashboard

Visit `/governance` for a 6-tab governance dashboard: **Overview**, **Audit Trail**,
**Agent Fleet**, **Policy Engine**, **Compliance**, and **SLO Monitor**.

The dashboard renders bundled fixtures out of the box, so it works with no backend.
When a backend is connected, it automatically fetches live data from the governance
API at `/api/v1/governance/*` (via the service1 proxy) and swaps it in once the
response arrives. If the backend is unavailable, each tab gracefully falls back to
the bundled fixtures.

The fixtures live in `src/lib/governance/fixtures.ts` — edit them to change the
out-of-the-box data, and keep the shapes the same to stay compatible with the API.
