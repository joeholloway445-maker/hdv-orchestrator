import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { join } from "path";
import cors from "cors";
import http from "http";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { authRouter, tenantsRouter } from "./routes/auth";
import { workflowsRouter } from "./routes/workflows";
import { hopeRouter } from "./routes/hope";
import { executionsRouter } from "./routes/executions";
import { webhooksRouter } from "./routes/webhooks";
import { memoryRouter } from "./routes/memory";
import { credentialsRouter } from "./routes/credentials";
import { variablesRouter } from "./routes/variables";
import { tokensRouter } from "./routes/tokens";
import { templatesRouter } from "./routes/templates";
import { simulateRouter } from "./routes/simulate";
import { schedulesRouter } from "./routes/schedules";
import { planRouter } from "./routes/plan";
import { gpuRouter } from "./routes/gpu";
import queueRouter from "./routes/queue";
// Sea-Scyte domain routes
import { walletRouter } from "./routes/wallet";
import { membershipRouter } from "./routes/membership";
import { catalogRouter } from "./routes/catalog";
import { shopRouter } from "./routes/shop";
import { devicesRouter } from "./routes/devices";
import { distributionRouter } from "./routes/distribution";
import { newsRouter } from "./routes/news";
import { dashboardRouter } from "./routes/dashboard";
import { stripeWebhookRouter } from "./routes/stripeWebhook";
import { adminRouter } from "./routes/admin";
import knollRouter from "./routes/knoll";
import { apiKeysRouter } from "./routes/apikeys";
import { setupSocketIO } from "./socket";
import { verifyToken } from "./middleware/auth";
import { supabaseAuth } from "./middleware/supabase";
import { apiKeyAuth } from "./middleware/apiKeyAuth";
import { globalLimiter, authLimiter, executionLimiter, tenantLimiter } from "./middleware/rateLimit";

const healthPrisma = new PrismaClient();

const app = express();
const server = http.createServer(app);

// Security headers — CSP is off because the frontend is a separate origin
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-key", "x-api-key"],
}));

// Request size limits
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Global rate limit: 200 req/min per IP
app.use(globalLimiter);

// Auth routes: stricter limit to slow brute-force
app.use("/auth", authLimiter);

// Execution trigger — apply a tight per-IP cap
app.use("/workflows/:id/execute", executionLimiter);
app.use("/workflows/:id/run", executionLimiter);

// API key auth — checks x-api-key header before JWT auth
app.use(apiKeyAuth);

// Apply Supabase/HOPE token auth as a pre-pass before standard verifyToken
app.use(supabaseAuth);

// Per-tenant rate limit (500 req/min) — applied after auth so tenant ID is resolved.
// Requests with no tenant ID are skipped and fall through to the global IP limiter only.
app.use(tenantLimiter);

// Swagger UI — served at /docs
const swaggerDoc = load(
  readFileSync(join(__dirname, "../../openapi.yaml"), "utf8")
) as object;
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.use("/auth", authRouter);
app.use("/webhooks/list", verifyToken, webhooksRouter);
app.use("/webhooks", webhooksRouter);
app.use("/workflows", verifyToken, workflowsRouter);
app.use("/executions", verifyToken, executionsRouter);
app.use("/memory", verifyToken, memoryRouter);
app.use("/credentials", verifyToken, credentialsRouter);
app.use("/variables", verifyToken, variablesRouter);
app.use("/tokens", verifyToken, tokensRouter);
app.use("/apikeys", verifyToken, apiKeysRouter);
app.use("/templates", templatesRouter);
// DREAM simulation — requires auth
app.use("/simulate", verifyToken, simulateRouter);
app.use("/schedules", verifyToken, schedulesRouter);
// Subscription plan management
app.use("/plan", verifyToken, planRouter);
// GPU marketplace (listing read is public; write routes check user inside handler)
app.use("/gpu", gpuRouter);
// Tenant provisioning
app.use("/tenants", tenantsRouter);
// HOPE companion endpoints
app.use("/hope", verifyToken, hopeRouter);

// Admin endpoints — protected by ADMIN_SECRET_KEY header (no JWT required)
app.use("/admin", adminRouter);

// KNOLL Studio audit endpoint (ENTERPRISE+ plan required)
app.use("/knoll", knollRouter);

// Queue monitoring — admin-only (x-admin-key required inside the router)
app.use("/queue", queueRouter);

// ---------------------------------------------------------------------------
// Sea-Scyte domain routes
// ---------------------------------------------------------------------------
// Stripe webhook — must be registered before express.json() in production so
// the raw buffer is preserved for signature verification.  Here it runs after
// the global JSON parser; switch to express.raw() per-route when stripe pkg
// is installed.
app.use("/stripe/webhook", stripeWebhookRouter);

// Authenticated routes
app.use("/wallet", verifyToken, walletRouter);
app.use("/membership", verifyToken, membershipRouter);
app.use("/devices", verifyToken, devicesRouter);
app.use("/distribution", verifyToken, distributionRouter);
app.use("/dashboard", verifyToken, dashboardRouter);

// Public / mixed-auth routes
app.use("/catalog", catalogRouter);
app.use("/shop", shopRouter);
app.use("/news", newsRouter);

app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await healthPrisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }
  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks, uptime: process.uptime() });
});

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
});

setupSocketIO(io);

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => {
  console.log(`[API] Listening on http://localhost:${port}`);
});
