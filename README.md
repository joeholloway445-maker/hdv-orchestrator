# HDV Orchestrator — VISION Platform

A production-grade workflow automation engine with a visual node-based editor.
Built on the **HDV Big Five**: HOPE (auth), VISION (triggers), DREAM (simulation), KNOLL (security), APEX (AI routing).

## Architecture

```
packages/
  api/      — Express REST API + Prisma (PostgreSQL) + Socket.IO
  worker/   — BullMQ worker executing workflow DAGs (40+ node types)
  frontend/ — React 18 + Vite + ReactFlow + Zustand + Tailwind
tests/      — Jest integration tests (1200+)
```

## Prerequisites

- Node.js 20+
- Docker + Docker Compose

## Local development

```bash
# 1. Copy environment files
cp .env.example .env
cp packages/api/.env.example packages/api/.env
cp packages/worker/.env.example packages/worker/.env

# 2. Fill in required values (see Environment variables below)
#    At minimum: JWT_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY

# 3. Start Postgres + Redis
docker compose up -d postgres redis

# 4. Install dependencies
npm install

# 5. Generate Prisma client and run migrations
npm run generate --workspace=packages/api
npm run migrate --workspace=packages/api

# 6. Start all services concurrently
npm run dev:all
```

Services:
- API:      http://localhost:4000
- Frontend: http://localhost:5173
- Worker:   background process

## Docker (full stack)

```bash
docker compose up --build
```

Starts: `postgres`, `redis`, `api` (port 4000), `worker`, `frontend` (port 3000).

## Running tests

```bash
npm test
```

## Environment variables

| Variable                  | Required | Description                                                    |
|---------------------------|----------|----------------------------------------------------------------|
| `DATABASE_URL`            | ✅        | PostgreSQL URL (`postgresql://user:pass@host:5432/db`)         |
| `REDIS_URL`               | ✅        | Redis URL (`redis://localhost:6379`)                           |
| `JWT_SECRET`              | ✅        | Long random string for signing auth tokens                     |
| `ENCRYPTION_KEY`          | ✅        | 64-char hex string for AES-256-GCM credential encryption       |
| `AI_BASE_URL`             | ✅        | OpenAI-compatible inference URL (e.g. `http://localhost:11434` for Ollama) |
| `AI_MODEL`                | ✅        | Default model name served by your runtime (e.g. `llama3.2`)   |
| `AI_API_KEY`              | optional | API key for inference endpoint (not needed for local Ollama)   |
| `AI_MODEL_FAST`           | optional | Smaller/faster model for low-budget tasks                      |
| `AI_MODEL_POWER`          | optional | Larger model for high-complexity/security tasks                |
| `SUPABASE_URL`            | optional | Supabase project URL (enables HOPE auth node)                  |
| `SUPABASE_ANON_KEY`       | optional | Supabase anon key                                              |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Supabase service role key                                    |
| `FRONTEND_URL`            | optional | CORS origin in production (default: `http://localhost:5173`)   |
| `PORT`                    | optional | API port (default: 4000)                                       |
| `NODE_ENV`                | optional | `production` in prod                                           |

Generate secrets:
```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ENCRYPTION_KEY (must be exactly 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Production deployment (Fly.io)

### 1. Install Fly CLI
```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Authenticate
```bash
fly auth login
```

### 3. Create apps
```bash
# API
fly launch --config fly.toml --no-deploy

# Frontend (separate app)
fly launch --dockerfile packages/frontend/Dockerfile --no-deploy
```

### 4. Provision Postgres + Redis on Fly
```bash
fly postgres create --name vision-db
fly redis create --name vision-redis
```

### 5. Set secrets
```bash
fly secrets set \
  JWT_SECRET="<your-jwt-secret>" \
  ENCRYPTION_KEY="<your-64-char-hex>" \
  ANTHROPIC_API_KEY="<your-anthropic-key>" \
  DATABASE_URL="<postgres-url-from-fly>" \
  REDIS_URL="<redis-url-from-fly>" \
  FRONTEND_URL="https://<your-frontend-app>.fly.dev" \
  --app vision-hdv-api
```

### 6. Deploy
```bash
fly deploy --config fly.toml
```

### 7. Run migrations on first deploy
```bash
fly ssh console --app vision-hdv-api
# Inside the container:
npx prisma migrate deploy
```

## Alternative: Railway

1. Create a new Railway project
2. Add a PostgreSQL service and Redis service
3. Connect this GitHub repo — Railway auto-detects Docker Compose
4. Set the same environment variables in Railway's dashboard
5. Deploy

## Node types (40+)

| Category    | Nodes                                                              |
|-------------|-------------------------------------------------------------------|
| Triggers    | Webhook, Schedule, Manual                                         |
| HTTP        | HTTP Request, Webhook Response                                    |
| Logic       | If/Branch, Switch, Merge, Loop, Split Batches, Wait, Stop/Error   |
| Data        | Set, Transform, Filter, Aggregate, Sort, Limit, Deduplicate, Rename Keys |
| AI / HDV    | APEX (MoE routing), DREAM (simulate/generate), VISION (trigger), HOPE (auth), KNOLL (security) |
| AI          | Generic AI node (any Anthropic model)                             |
| Code        | Code (sandboxed JS via isolated-vm)                               |
| Files       | CSV, XML, HTML                                                    |
| Comms       | Email, Slack                                                      |
| Storage     | Database, Memory (user key-value), Sub-workflow                   |
| Utilities   | JSON Path, Date/Time, Crypto, RSS, Validate                       |
