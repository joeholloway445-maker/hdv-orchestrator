import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;
  const search = req.query.search as string | undefined;
  const tag = req.query.tag as string | undefined;
  const active = req.query.active as string | undefined;

  const where: Record<string, unknown> = { userId: req.userId! };
  if (cursor) where.id = { lt: cursor };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { description: { contains: search, mode: "insensitive" } },
  ];
  if (tag) where.tags = { has: tag };

  const workflows = await (prisma as any).workflow.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      _count: { select: { executions: true } },
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { status: true, startedAt: true },
      },
    },
  });
  const nextCursor = workflows.length === limit ? workflows[workflows.length - 1].id : null;
  res.json({ items: workflows, nextCursor });
});

router.post("/", async (req: AuthRequest, res) => {
  const { name, nodes, edges } = req.body;
  const workflow = await prisma.workflow.create({
    data: {
      name: name || "Untitled Workflow",
      userId: req.userId!,
      nodes: nodes || [],
      edges: edges || [],
    },
  });
  res.status(201).json(workflow);
});

router.get("/:id", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });
  res.json(workflow);
});

router.put("/:id", async (req: AuthRequest, res) => {
  const { name, nodes, edges, active, errorWorkflowId, timeoutMs, tags, maxConcurrency, description } = req.body;
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const updated = await (prisma as any).workflow.update({
    where: { id: req.params.id },
    data: {
      name, nodes, edges, active,
      ...(errorWorkflowId !== undefined ? { errorWorkflowId } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs: timeoutMs ? Number(timeoutMs) : null } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(maxConcurrency !== undefined ? { maxConcurrency: maxConcurrency ? Number(maxConcurrency) : null } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
    },
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });
  await prisma.workflow.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ── Duplicate ──────────────────────────────────────────────────────────────

router.post("/:id/duplicate", async (req: AuthRequest, res) => {
  const source = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!source) return res.status(404).json({ error: "Not found" });

  const copy = await prisma.workflow.create({
    data: {
      name: `${source.name} (Copy)`,
      userId: req.userId!,
      nodes: source.nodes as object[],
      edges: source.edges as object[],
      active: false,
    },
  });
  res.status(201).json(copy);
});

// ── Versioning ─────────────────────────────────────────────────────────────

router.get("/:id/versions", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const versions = await (prisma as any).workflowVersion.findMany({
    where: { workflowId: req.params.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true },
  });
  res.json(versions);
});

router.post("/:id/versions", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const label = req.body.name || `Snapshot ${new Date().toISOString()}`;
  const version = await (prisma as any).workflowVersion.create({
    data: {
      workflowId: workflow.id,
      name: label,
      nodes: workflow.nodes,
      edges: workflow.edges,
    },
  });
  res.status(201).json(version);
});

router.post("/:id/versions/:versionId/restore", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const version = await (prisma as any).workflowVersion.findUnique({
    where: { id: req.params.versionId },
  });
  if (!version || version.workflowId !== req.params.id)
    return res.status(404).json({ error: "Version not found" });

  const updated = await prisma.workflow.update({
    where: { id: req.params.id },
    data: { nodes: version.nodes, edges: version.edges },
  });
  res.json(updated);
});

// ── Execute ─────────────────────────────────────────────────────────────────

router.post("/:id/execute", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const triggerData = req.body.data || {};
  const execution = await prisma.execution.create({
    data: { workflowId: workflow.id, status: "PENDING", data: { triggerData } },
  });

  await enqueueWorkflow({
    workflowId: workflow.id,
    executionId: execution.id,
    triggerData,
  });

  res.status(202).json(execution);
});

// ── Test Single Node ─────────────────────────────────────────────────────────

router.post("/:id/test-node", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const { nodeId, input } = req.body as { nodeId?: string; input?: Record<string, unknown> };
  const nodes = (workflow.nodes as Array<{ id: string; data: Record<string, unknown> }>);
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : null;
  if (!node) return res.status(404).json({ error: "Node not found in workflow" });

  const workerUrl = process.env.WORKER_INTERNAL_URL || "http://localhost:4001";
  try {
    const resp = await fetch(`${workerUrl}/test-node`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node, input: input || {} }),
    });
    const data = await resp.json() as Record<string, unknown>;
    res.json(data);
  } catch {
    res.status(502).json({ error: "Worker unavailable — ensure the worker process is running" });
  }
});

// ── Stats ──────────────────────────────────────────────────────────────────

router.get("/:id/stats", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const [total, byStatus] = await Promise.all([
    prisma.execution.count({ where: { workflowId: req.params.id } }),
    prisma.execution.groupBy({
      by: ["status"],
      where: { workflowId: req.params.id },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of byStatus) counts[row.status] = row._count._all;

  const successRate = total > 0 ? ((counts["SUCCESS"] ?? 0) / total) * 100 : null;

  // Compute average duration of successful executions (last 100)
  const recentSuccessful = await prisma.execution.findMany({
    where: { workflowId: req.params.id, status: "SUCCESS", finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 100,
    select: { startedAt: true, finishedAt: true },
  });
  const durations = recentSuccessful
    .filter((e) => e.finishedAt)
    .map((e) => new Date(e.finishedAt!).getTime() - new Date(e.startedAt).getTime());
  const avgDurationMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  res.json({
    total,
    counts,
    successRate: successRate !== null ? Math.round(successRate * 10) / 10 : null,
    avgDurationMs: avgDurationMs !== null ? Math.round(avgDurationMs) : null,
  });
});

export { router as workflowsRouter };
