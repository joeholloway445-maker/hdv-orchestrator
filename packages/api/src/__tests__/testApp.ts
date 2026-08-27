/**
 * Creates a minimal Express app for integration testing.
 * Callers can pass extraMiddleware to inject auth stubs (e.g. for GPU routes).
 */
import express, { RequestHandler } from "express";
import { authRouter } from "../routes/auth";
import { workflowsRouter } from "../routes/workflows";
import { gpuRouter } from "../routes/gpu";
import { verifyToken } from "../middleware/auth";

export function createTestApp(options: { gpuAuthMiddleware?: RequestHandler } = {}) {
  const app = express();
  app.use(express.json());

  // Minimal health endpoint (no real DB required — mocked via @prisma/client mock)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Auth routes (register / login — no JWT required)
  app.use("/auth", authRouter);

  // Workflow routes — protected by standard JWT verifyToken
  app.use("/workflows", verifyToken, workflowsRouter);

  // GPU routes — public for GET, handler-level auth for writes.
  // In tests for write paths, callers inject gpuAuthMiddleware to simulate a
  // logged-in user (sets req.user = { id }) so the handler can find it.
  if (options.gpuAuthMiddleware) {
    app.use("/gpu", options.gpuAuthMiddleware, gpuRouter);
  } else {
    app.use("/gpu", gpuRouter);
  }

  return app;
}
