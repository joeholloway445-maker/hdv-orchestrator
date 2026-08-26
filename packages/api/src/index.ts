import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { authRouter } from "./routes/auth";
import { workflowsRouter } from "./routes/workflows";
import { executionsRouter } from "./routes/executions";
import { webhooksRouter } from "./routes/webhooks";
import { memoryRouter } from "./routes/memory";
import { credentialsRouter } from "./routes/credentials";
import { variablesRouter } from "./routes/variables";
import { tokensRouter } from "./routes/tokens";
import { templatesRouter } from "./routes/templates";
import { simulateRouter } from "./routes/simulate";
import { setupSocketIO } from "./socket";
import { verifyToken } from "./middleware/auth";
import { supabaseAuth } from "./middleware/supabase";

const healthPrisma = new PrismaClient();

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Global rate limit: 300 req/min per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  })
);

// Auth routes get a stricter limit to slow brute-force
app.use(
  "/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts, please try again later." },
  })
);

// Apply Supabase/HOPE token auth as a pre-pass before standard verifyToken
app.use(supabaseAuth);

app.use("/auth", authRouter);
app.use("/webhooks/list", verifyToken, webhooksRouter);
app.use("/webhooks", webhooksRouter);
app.use("/workflows", verifyToken, workflowsRouter);
app.use("/executions", verifyToken, executionsRouter);
app.use("/memory", verifyToken, memoryRouter);
app.use("/credentials", verifyToken, credentialsRouter);
app.use("/variables", verifyToken, variablesRouter);
app.use("/tokens", verifyToken, tokensRouter);
app.use("/templates", verifyToken, templatesRouter);
// DREAM simulation — requires auth
app.use("/simulate", verifyToken, simulateRouter);

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
