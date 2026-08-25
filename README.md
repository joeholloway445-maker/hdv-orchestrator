# HDV Orchestrator

A workflow automation engine with a visual node-based editor.

## Structure

```
packages/
  api/      — Express REST API + Prisma (PostgreSQL)
  worker/   — BullMQ worker that executes workflow DAGs
  web/      — React + Vite frontend
```

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + Redis)

## Quick start

```bash
# Start Postgres and Redis
docker compose up -d

# Install dependencies
npm install

# Run database migrations
npm run migrate --workspace=packages/api

# Start all services
npm run dev:all
```

`npm run dev:all` launches the API (port 4000), worker, and web dev server (port 5173) concurrently.

## Environment variables

Copy `.env.example` to `.env` in `packages/api/` and `packages/worker/`:

| Variable        | Description                          |
|-----------------|--------------------------------------|
| DATABASE_URL    | PostgreSQL connection string         |
| REDIS_URL       | Redis connection string              |
| JWT_SECRET      | Secret for signing auth tokens       |
| ENCRYPTION_KEY  | 64-char hex key for AES-256-GCM      |
| FRONTEND_URL    | Allowed CORS origin (default: http://localhost:5173) |
