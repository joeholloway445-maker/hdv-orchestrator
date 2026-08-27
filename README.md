# HDV Orchestrator — The Periliminal Space Automation Platform

A production-grade, n8n-style visual DAG automation engine built around the **Big Five AI agents**: HOPE, VISION, DREAM, KNOLL, and APEX. Each agent maps to a subscription tier and a distinct role in the orchestration hierarchy. The platform serves as the back-end automation layer for the HDV Periliminal Space — a multi-tenant AI companion and content delivery platform.

---

## API Docs

API docs available at **http://localhost:4000/docs** when running locally.

---

## Overview

HDV Orchestrator provides:

- **Visual workflow editor** — ReactFlow canvas with 40+ node types, drag-and-drop DAG construction, live execution logs streamed over Socket.IO
- **Execution engine** — BullMQ-backed worker that runs every node type including AI inference, HTTP requests, code sandboxing, sub-workflows, and all five HDV-native agent nodes
- **Big Five agent hierarchy** — a strictly one-directional memory bus (DREAM → VISION → HOPE) with KNOLL auditing all traffic and APEX routing inference to the cheapest available model or GPU
- **Multi-tenant architecture** — every registered user receives a `tenantId` at signup; companion workflows, memory, credentials, and GPU listings are all tenant-scoped
- **GPU marketplace** — users list their own hardware for burst image/video generation tasks; APEX routes burst workloads to the cheapest active listing
- **Sea-Scyte commerce layer** — wallet, membership tiers, content catalog, shop orders, and device registration for media distribution
- **BYOK support** — ENTERPRISE or BYOK tenants supply their own OpenAI-compatible endpoint and pay no HDV inference bill

---

## Architecture

```
Browser
  │
  ▼
Frontend (React 18 + Vite + ReactFlow + Tailwind)
  │  REST / Socket.IO
  ▼
API  (Express + Prisma + Socket.IO)          port 4000
  │  BullMQ job enqueue
  ▼
Worker (BullMQ consumers)
  │
  ├── Node executor (40+ node types)
  │
  └── Big Five Agents
        DREAM  ──▶  VISION  ──▶  HOPE
                                  ▲
        APEX ────────────────────╯
        KNOLL  (read-only audit — never writes)
  │
  ▼
Prisma ORM
  │
  ▼
PostgreSQL                       Redis (BullMQ queues + memory bus TTL)
```

**Memory bus rule**: data flows strictly upward — DREAM may only write to VISION, VISION may only write to HOPE, APEX may only report to HOPE. KNOLL reads everything and never writes. Lateral or downward writes throw at runtime.

---

## Big Five Agents

| Agent  | Role               | Tier Required | Description |
|--------|--------------------|---------------|-------------|
| **HOPE**  | Auth + Companion   | FREE          | Supabase JWT auth middleware and per-tenant companion workflow. Issues governance directives based on synthesised VISION output. Anchors the top of the one-way memory bus and holds the ethical layer — no escalation without HOPE approval. |
| **VISION** | Automation        | PRO+          | Synthesises DREAM output into an operational intent packet. Consumed by HOPE for governance. Powers the webhook, schedule, and event trigger node types and drives workflow orchestration decisions. |
| **DREAM**  | Simulation        | STARTER+      | LLM-powered intent simulation, companion response generation, mood derivation, and haptic suggestion. Writes the first record onto the memory bus. Supports dry-run and scoring passes before committing real side-effects. |
| **KNOLL**  | Security          | ENTERPRISE+   | Reads the entire memory bus (last 50 records per audit cycle). Validates every routing edge against the `ALLOWED_EDGES` table. Emits a `SYSTEM FREEZE` error log when the violation ratio exceeds 34 %. Backs the `AuditHashChain` for tamper-evident logs. |
| **APEX**   | MoE Routing       | ENTERPRISE+   | Mixture-of-Experts dispatch: selects the cheapest local model (`AI_MODEL_FAST`, `AI_MODEL`, `AI_MODEL_POWER`, `AI_MODEL_VISION`) based on intent category and budget tier. When `gpuBurst=true`, routes to the lowest-rate active GPU marketplace listing instead of local Ollama. Falls back to built-in heuristic when `APEX_BASE_URL` is not set. |

---

## Subscription Tiers

| Tier         | Agents Unlocked              | What's Included |
|--------------|------------------------------|-----------------|
| **FREE**     | HOPE                         | Auth, per-tenant companion workflow, memory bus (read), basic workflows |
| **STARTER**  | HOPE + DREAM                 | + LLM simulation nodes, dry-run scoring, Hostinger KVM4 model access |
| **PRO**      | HOPE + DREAM + VISION        | + Cloud model access, higher parameter budget, webhook/schedule triggers, full workflow orchestration |
| **ENTERPRISE** | All five agents            | + KNOLL security auditing, AuditHashChain, APEX MoE routing, GPU marketplace burst, no parameter cap |
| **BYOK**     | All five agents (own endpoint) | Tenant supplies their own OpenAI-compatible base URL and model; no HDV platform inference bill |

Tier is stored on `User.plan` (enum `SubscriptionPlan`). The `requireStudio()` middleware enforces tier access at the route level before any node executor runs.

---

## API Routes Reference

All routes require a `Bearer <token>` header unless marked public. Tokens are issued by `POST /auth/login` and `POST /auth/register`. Admin routes require an `x-admin-key` header instead.

### `/auth`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account; auto-assigns `tenantId`. Returns JWT. |
| `POST` | `/auth/login` | Password auth. Returns JWT (`isAdmin` claim for the admin email). |
| `GET`  | `/auth/me` | Current user profile including plan, tenantId, BYOK config. |
| `PATCH`| `/auth/me` | Update profile fields. |
| `PATCH`| `/auth/byok` | Configure BYOK: set `byokBaseUrl`, `byokModel`, `maxActiveParams`. |
| `POST` | `/tenants/provision` | Idempotently ensure the caller has a `tenantId`. |

### `/workflows`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/workflows` | Paginated list with cursor; filter by `?active`, `?tag`, `?search`, `?tenantId`. |
| `POST` | `/workflows` | Create workflow (name, nodes, edges, tags). |
| `GET`  | `/workflows/:id` | Get workflow with executions. |
| `PATCH`| `/workflows/:id` | Update name, nodes, edges, active, tags, description, timeoutMs, maxConcurrency. |
| `DELETE`| `/workflows/:id` | Delete workflow and all executions. |
| `POST` | `/workflows/:id/execute` | Manually trigger execution; enqueues BullMQ job. |
| `GET`  | `/workflows/:id/executions` | Execution history for a workflow. |
| `GET`  | `/workflows/:id/versions` | Version history. |
| `POST` | `/workflows/:id/versions` | Snapshot current nodes/edges as a named version. |
| `POST` | `/workflows/:id/versions/:versionId/restore` | Restore nodes/edges from a version. |

### `/schedules`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/schedules` | All active workflows with schedule trigger nodes and their last execution. |

### `/hope`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/hope/companion` | Look up or create the per-tenant HOPE companion workflow (idempotent). |
| `GET`  | `/hope/companion` | Fetch companion workflow and current execution state. |

### `/gpu`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/gpu` | All ACTIVE GPU listings ordered by `ratePerHour` asc (used by APEX router). |
| `GET`  | `/gpu/mine` | Caller's own GPU listings. |
| `POST` | `/gpu` | List a GPU: label, gpuModel, vramGb, ratePerHour, endpointUrl, apiKey. |
| `PATCH`| `/gpu/:id` | Update listing fields or status. |
| `DELETE`| `/gpu/:id` | Remove listing. |

### `/memory`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/memory` | All key-value memory entries for the authenticated user. |
| `PUT`  | `/memory/:key` | Upsert a memory entry (value is arbitrary JSON). |
| `DELETE`| `/memory/:key` | Delete a memory entry. |

### `/wallet`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/wallet` | Wallet balance and transaction history. |
| `POST` | `/wallet/deposit` | Record a deposit transaction. |
| `POST` | `/wallet/withdraw` | Record a withdrawal transaction. |

### `/membership`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/membership` | Current membership tier and expiry. |
| `POST` | `/membership/upgrade` | Upgrade membership tier (tier, expiresAt). |

### `/catalog`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/catalog` | Browse content items (film, tv, music, merch). Filter by `?type`, `?tag`. |
| `GET`  | `/catalog/:id` | Single content item detail. |

### `/shop`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/shop/orders` | Caller's order history. |
| `POST` | `/shop/orders` | Create an order from catalog item IDs. |
| `GET`  | `/shop/orders/:id` | Order detail with line items. |

### `/devices`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/devices` | List registered devices for the caller. |
| `POST` | `/devices` | Register a device (label). Returns a bearer token for the device. |
| `DELETE`| `/devices/:id` | Revoke a device token. |

### `/distribution`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/distribution/content` | Admin-accessible content distribution listing. |

### `/news`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/news` | Published news articles (slug, title, tags). |
| `GET`  | `/news/:slug` | Single article body. |

### `/dashboard`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/dashboard` | Aggregate stats: workflow count, recent executions, memory count, GPU listings. |

### `/stripe/webhook`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/stripe/webhook` | Stripe webhook receiver (raw body, `stripe-signature` header). Handles `checkout.session.completed`, `invoice.payment_succeeded`, etc. |

### `/admin`

All admin routes require header `x-admin-key: $ADMIN_SECRET_KEY`.

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/admin/tenants` | All users: id, email, plan, tenantId, GPU listing count. |
| `PATCH`| `/admin/tenants/:userId/plan` | Upgrade or downgrade a user's subscription plan. |
| `GET`  | `/admin/gpu` | All GPU listings across all tenants with owner email. |
| `PATCH`| `/admin/gpu/:id/status` | Force-set listing status (ACTIVE / PAUSED / OFFLINE). |

### Other mounted routers

| Prefix | Description |
|--------|-------------|
| `/executions` | Cross-workflow execution history for the authenticated user. |
| `/webhooks` | Webhook endpoint registration and inbound webhook receiver (`/webhooks/trigger/:path`). |
| `/templates` | Workflow template library — list, get, and instantiate templates. |
| `/tokens` | API token management — create, list, revoke personal API tokens. |
| `/credentials` | Encrypted credential store — create, list, delete named credentials (AES-256-GCM at rest). |
| `/variables` | Global variable store — per-tenant key-value pairs available to all workflows. |
| `/simulate` | DREAM dry-run endpoint — simulate a workflow execution without committing side-effects. |
| `/plan` | Subscription plan info and upgrade links. |

---

## Node Types Reference

The worker's node executor handles the following node types. Custom nodes can be added by extending the `NodeExecutor` registry.

| Category | Node Type(s) | Description |
|----------|-------------|-------------|
| **HDV Agents** | `hope` | HOPE companion trigger; enforces ethical governance layer |
| | `vision` | VISION trigger; synthesises DREAM context into operational intent |
| | `dream` | DREAM simulation; LLM-powered companion response and mood derivation |
| | `knoll` | KNOLL sentinel; audits memory bus, emits violations |
| | `apex` | APEX MoE router; selects model by category/budget or routes to GPU marketplace |
| **AI** | `ai` | Generic AI inference node; calls any OpenAI-compatible endpoint |
| **Triggers** | `trigger` | Manual trigger; starts workflow on demand |
| | `webhook` | Inbound webhook trigger; listens at `/webhooks/trigger/:path` |
| | `schedule` | Cron/interval schedule trigger |
| **HTTP** | `http` | Outbound HTTP request (GET/POST/PUT/PATCH/DELETE) with auth and retry |
| **Transform** | `transform` | JMESPath / JSONPath expression transform |
| | `condition` | Boolean branch: if-true / if-false output edges |
| **Flow** | `delay` | Fixed or expression-driven delay between nodes |
| | `sub-workflow` | Execute another workflow inline and collect its output |
| **Data** | `set` | Add or overwrite fields on the data object |
| | `filter` | Drop items that fail a condition |
| | `aggregate` | Reduce an array of items to a single value |
| | `sort` / `limit` / `deduplicate` | Array manipulation |
| **Code** | `code` | Sandboxed JavaScript execution via `isolated-vm` |
| **Storage** | `memory` | Read or write a user memory key-value entry |
| | `database` | Raw Prisma query node |
| **Comms** | `email` | SMTP email send |
| | `slack` | Slack webhook message |
| **Utilities** | `csv` / `xml` / `html` | Parse or generate structured file formats |
| | `date` / `crypto` / `rss` / `validate` | Date formatting, hashing, RSS feed fetch, schema validation |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string: `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Yes | Redis connection string: `redis://host:6379` |
| `JWT_SECRET` | Yes | Long random string used to sign user JWTs (7-day expiry) |
| `ENCRYPTION_KEY` | Yes | 64-character hex string for AES-256-GCM encryption of stored credentials. Generate: `openssl rand -hex 32` |
| `PORT` | No | API listen port (default: `4000`) |
| `NODE_ENV` | No | `production` in deployed environments |
| `WEBHOOK_BASE_URL` | No | Public base URL for inbound webhook URLs shown in the UI (e.g. `https://api.yourdomain.com`) |
| `FRONTEND_URL` | No | CORS allowed origin (default: `http://localhost:3000`) |
| `VITE_API_BASE_URL` | No | Browser-side API base URL injected at Vite build time |
| `VITE_WS_URL` | No | Browser-side Socket.IO URL injected at Vite build time |
| `AI_BASE_URL` | Yes | OpenAI-compatible inference endpoint. Ollama default: `http://localhost:11434`. vLLM/LM Studio: `http://localhost:8000` |
| `AI_API_KEY` | No | API key for the inference endpoint. Leave as `ollama` for local Ollama. |
| `AI_MODEL` | Yes | Default model name (e.g. `llama3.2`, `mistral`, `qwen2.5-coder`) |
| `AI_MODEL_FAST` | No | Smaller/faster model for low-budget APEX routes |
| `AI_MODEL_POWER` | No | Larger model for security and high-complexity APEX routes |
| `AI_MODEL_VISION` | No | Multimodal model for vision tasks (e.g. `llava`) |
| `APEX_BASE_URL` | No | External APEX MoE routing service URL. Falls back to built-in heuristic when unset. |
| `APEX_API_KEY` | No | API key for external APEX service |
| `WORKFLOW_API_KEY` | No | Shared secret for API ↔ worker internal calls (default: `hdv-internal-key`) |
| `WORKFLOW_API_URL` | No | URL the worker uses to call back into the API (default: `http://localhost:4000`) |
| `SUPABASE_URL` | No | Supabase project URL — enables HOPE JWT auth middleware |
| `SUPABASE_ANON_KEY` | No | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key (worker only, for admin operations) |
| `SUPABASE_JWT_SECRET` | No | Supabase JWT secret for server-side verification |
| `HDV_HOSTINGER_LLM_BASE_URL` | No | Ollama URL on your Hostinger KVM4 VPS (e.g. `http://<kvm4-ip>:11434`) — used for STARTER/PRO model routes |
| `HDV_HOSTINGER_LLM_API_KEY` | No | API key for the Hostinger LLM endpoint (blank for bare Ollama) |
| `HDV_LLM_BASE_URL` | No | Cloud LLM endpoint for PRO/ENTERPRISE plans |
| `HDV_LLM_API_KEY` | No | API key for the cloud LLM endpoint |
| `GPU_BURST_PROVIDER` | No | GPU burst marketplace: `vastai`, `runpod`, or `custom` |
| `GPU_BURST_API_KEY` | No | API key for the GPU burst provider |
| `RUNPOD_API_KEY` | No | RunPod API key (when `GPU_BURST_PROVIDER=runpod`) |
| `RUNPOD_ENDPOINT_ID` | No | RunPod endpoint ID |
| `VASTAI_API_KEY` | No | Vast.ai API key (when `GPU_BURST_PROVIDER=vastai`) |
| `MEMORY_PERSIST_PATH` | No | File system path for memory bus persistence (default: `./data/memory`) |
| `ADMIN_SECRET_KEY` | No | Secret required in `x-admin-key` header to access `/admin/*` endpoints |
| `ADMIN_EMAIL` | No | Email address that receives `isAdmin: true` in their JWT on login |
| `VITE_ADMIN_SECRET_KEY` | No | Browser-accessible admin key for the frontend admin panel (dev only) |
| `WORKER_CONCURRENCY` | No | Number of BullMQ job slots the worker processes in parallel (default: `4`) |
| `POSTGRES_USER` | No | Postgres username for docker-compose (default: `postgres`) |
| `POSTGRES_PASSWORD` | No | Postgres password for docker-compose (default: `postgres`) |
| `POSTGRES_DB` | No | Postgres database name for docker-compose (default: `workflow_platform`) |
| `API_PORT` | No | Host port exposed by docker-compose for the API (default: `4000`) |
| `FRONTEND_PORT` | No | Host port exposed by docker-compose for the frontend (default: `3000`) |

Generate required secrets:

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ENCRYPTION_KEY (must be exactly 64 hex chars / 32 bytes)
openssl rand -hex 32
```

---

## Deployment

### Local Development

```bash
# 1. Copy and edit the env file
cp .env.example .env

# 2. Start Postgres and Redis
docker compose up -d postgres redis

# 3. Install dependencies (monorepo root)
npm install

# 4. Generate Prisma client and run migrations
npm run generate --workspace=packages/api
npm run migrate --workspace=packages/api

# 5. Start API, worker, and frontend concurrently
npm run dev:all
```

Services:
- API: `http://localhost:4000`
- Frontend: `http://localhost:5173` (Vite dev server)
- Worker: background process (no HTTP port)

### Docker Compose — Full Stack

Builds and starts all four services in one command. Suitable for local full-stack testing and Hostinger KVM4 deployments.

```bash
docker compose up --build
```

Services started: `postgres` (internal), `redis` (internal), `api` (port 4000), `worker` (background), `frontend` (port 3000).

#### Hostinger KVM4 Production

On your KVM4 VPS, expose Ollama on all interfaces and open port 11434 in your firewall, then set `AI_BASE_URL` and `HDV_HOSTINGER_LLM_BASE_URL` in `.env`:

```bash
# On the KVM4 VPS — expose Ollama
OLLAMA_HOST=0.0.0.0 ollama serve

# On the orchestrator host
AI_BASE_URL=http://<kvm4-ip>:11434
HDV_HOSTINGER_LLM_BASE_URL=http://<kvm4-ip>:11434

docker compose -f docker-compose.yml up -d
```

Run migrations on first deploy:

```bash
docker compose exec api npx prisma migrate deploy
```

### Railway

`railway.toml` defines three services — `api`, `worker`, and `frontend` — all built with Nixpacks.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Authenticate and deploy
railway login
railway link   # link to your Railway project
railway up
```

The worker service references the API's private Railway URL via `${{api.RAILWAY_PRIVATE_URL}}` — no manual wiring needed. Set all required secrets in the Railway dashboard before the first deploy.

**Required Railway secrets**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `HDV_HOSTINGER_LLM_BASE_URL`, `HDV_HOSTINGER_LLM_API_KEY`, `WORKFLOW_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.

### Fly.io

Two Fly apps: the API (`fly.toml`) and the worker (`fly.worker.toml`). Both use shared-CPU `512 MB` VMs in `iad`.

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh
fly auth login

# Deploy API
fly launch --config fly.toml --no-deploy
fly secrets set DATABASE_URL="..." REDIS_URL="..." JWT_SECRET="..." \
  ENCRYPTION_KEY="..." AI_BASE_URL="..." AI_MODEL="..." \
  WORKFLOW_API_KEY="..." SUPABASE_URL="..." SUPABASE_ANON_KEY="..." \
  --app hdv-orchestrator
fly deploy --config fly.toml

# Deploy Worker (no external port — connects via private Fly network)
fly launch --config fly.worker.toml --no-deploy
fly secrets set DATABASE_URL="..." REDIS_URL="..." ENCRYPTION_KEY="..." \
  AI_BASE_URL="..." WORKFLOW_API_KEY="..." \
  WORKFLOW_API_URL="http://hdv-orchestrator.internal:4000" \
  --app hdv-orchestrator-worker
fly deploy --config fly.worker.toml

# Run migrations (first deploy only)
fly ssh console --app hdv-orchestrator -C "npx prisma migrate deploy"
```

---

## BYOK — Bring Your Own Key

BYOK tenants supply their own OpenAI-compatible inference endpoint. The platform bills zero inference tokens to the HDV account for BYOK tenants.

**Configure BYOK:**

```bash
PATCH /auth/byok
Authorization: Bearer <token>
Content-Type: application/json

{
  "byokBaseUrl": "https://api.openai.com/v1",
  "byokModel": "gpt-4o-mini",
  "maxActiveParams": null
}
```

The worker reads `user.byokBaseUrl` and `user.byokModel` from the execution context and substitutes them for the platform defaults on every AI and HDV agent node call. BYOK requires ENTERPRISE or BYOK subscription plan; the `requireStudio("ENTERPRISE")` middleware gate enforces this.

---

## Security

### KNOLL Sentinel

KNOLL audits the shared memory bus every cycle. It maintains an `ALLOWED_EDGES` table:

```
DREAM  → VISION   (only permitted destination for DREAM)
VISION → HOPE     (only permitted destination for VISION)
HOPE   → (none)   (terminal — no downstream writes)
KNOLL  → (none)   (observer — never writes)
APEX   → HOPE     (execution reports flow upward only)
```

When the ratio of illegal routing records exceeds **34 %** of the last 50 records, KNOLL emits a `SYSTEM FREEZE` error log. Below that threshold, violations are emitted as warnings. KNOLL's `process()` always returns `null` — it never injects records into the bus.

### AuditHashChain

Every KNOLL `SecurityAuditEntry` is appended to a SHA-256 hash chain (`AuditHashChain`). Each link stores:

- `index` — position in the chain
- `entryHash` — SHA-256 of the canonical entry JSON
- `prevHash` — hash of the preceding link (`0x00…00` for genesis)
- `hash` — SHA-256 of `index|prevHash|entryHash`

`AuditHashChain.verify()` walks the entire chain and returns `{ valid, length, brokenAt, reason }`. `detectTamper()` compares a live entry array against the sealed chain — any insertion, deletion, or modification returns the position of the first discrepancy.

### `requireStudio()` Middleware

Route handlers that invoke HDV agent node types call `requireStudio(minPlan)` before execution. The middleware reads the user's `plan` from the JWT, converts it to a numeric tier, and rejects with `403` if the tenant's tier is below the minimum required for that studio.

### Rate Limiting

The API applies per-tenant rate limits on all execution and AI inference endpoints. Limits are configurable per plan tier. Exceeded limits return `429 Too Many Requests` with a `Retry-After` header.

### Credential Encryption

All credentials stored via `/credentials` are encrypted at rest with AES-256-GCM using the `ENCRYPTION_KEY` environment variable. The ciphertext, IV, and auth tag are stored together; decryption only occurs at node execution time inside the worker.

---

## Data Model Summary

Core Prisma models and their purpose:

| Model | Purpose |
|-------|---------|
| `User` | Account with plan, tenantId, BYOK config, and all owned resources |
| `Workflow` | DAG definition: nodes (JSON), edges (JSON), active flag, tags, concurrency limits |
| `Execution` | A single workflow run: status, input data, start/finish timestamps |
| `ExecutionNodeLog` | Per-node execution record within an execution: input, output, error, timing |
| `WorkflowVersion` | Snapshot of nodes/edges at a point in time — used for version restore |
| `UserMemory` | Per-user key-value store scoped by `workflowId` (memory node reads/writes) |
| `Credential` | AES-256-GCM encrypted named credentials referenced in workflow nodes |
| `GlobalVariable` | Per-user typed key-value pairs available across all workflows |
| `ApiToken` | Hashed personal API tokens with prefix for display |
| `GpuListing` | User-listed GPU hardware for burst inference (APEX marketplace) |
| `Wallet` / `WalletTx` | USD balance and transaction ledger (Sea-Scyte commerce) |
| `Membership` | Sea-Scyte membership tier (free / basic / pro / vip) and expiry |
| `ContentItem` | Catalog items: film, tv, music, merch — with price, stock, and license terms |
| `Order` / `OrderItem` | Purchase orders linking users to catalog items |
| `Device` | Registered companion devices with bearer tokens (revocable) |
| `NewsArticle` | CMS-style news articles with slug routing |

---

## Running Tests

```bash
npm test
```

The `tests/` directory contains Jest integration tests (1200+) covering API routes, the BullMQ executor, agent behaviour, and hash chain integrity.

---

## Project Structure

```
hdv-orchestrator/
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/          # Express routers (one file per resource)
│   │   │   ├── middleware/      # auth.ts (JWT + Supabase), requireStudio
│   │   │   ├── queue/           # BullMQ producer
│   │   │   └── lib/             # Utilities (paginate, crypto, etc.)
│   │   └── prisma/
│   │       └── schema.prisma    # Single source of truth for the data model
│   ├── worker/
│   │   └── src/
│   │       ├── hdv/
│   │       │   ├── agents/      # hope.ts, vision.ts, dream.ts, knoll.ts, apex.ts
│   │       │   ├── memory_bus.ts  # Strict one-way message bus (file + Redis)
│   │       │   ├── hashchain.ts   # AuditHashChain implementation
│   │       │   ├── audit.ts       # SecurityAuditEntry type and log
│   │       │   ├── scenario_bank.ts  # DREAM scenario library
│   │       │   ├── tenancy/       # Multi-tenant context helpers
│   │       │   ├── providers/     # LLM provider adapters
│   │       │   └── observability/ # Metrics and tracing
│   │       └── executor/        # Node type handlers (40+ types)
│   └── frontend/
│       └── src/
│           ├── pages/           # Route-level React components
│           └── components/      # ReactFlow canvas, node palette, execution panel
├── docker-compose.yml           # Full-stack local/production compose
├── fly.toml                     # Fly.io API app config
├── fly.worker.toml              # Fly.io worker app config (no external port)
├── railway.toml                 # Railway three-service config
├── Dockerfile.api               # API container (Node 20 slim)
├── Dockerfile.worker            # Worker container (Node 20 slim)
└── .env.example                 # All environment variables with descriptions
```
