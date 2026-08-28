import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { enqueueWorkflow } from "../queue/producer";
import { parsePagination } from "../lib/paginate";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const q = req.query.q as string | undefined;
  const search = req.query.search as string | undefined;
  const searchTerm = q ?? search;
  const tag = req.query.tag as string | undefined;
  const active = req.query.active as string | undefined;
  const tenantId = req.query.tenantId as string | undefined;

  // Page-based pagination (preferred); fall back to cursor for backward compat
  const pageRaw = req.query.page as string | undefined;
  const limitRaw = req.query.limit as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  const limit = Math.min(Number(limitRaw) || 20, 100);
  const pageNum = Math.max(Number(pageRaw) || 1, 1);
  const skip = cursor ? undefined : (pageNum - 1) * limit;

  // When ?tenantId is provided, filter across all users belonging to that tenant
  // (identified by the canonical "tenant:{id}" tag); otherwise scope to this user.
  const where: Record<string, unknown> = tenantId
    ? { tags: { has: `tenant:${tenantId}` } }
    : { userId: req.userId! };

  if (cursor) where.id = { lt: cursor };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (searchTerm) where.OR = [
    { name: { contains: searchTerm, mode: "insensitive" } },
    { description: { contains: searchTerm, mode: "insensitive" } },
  ];
  // Explicit tag filter stacks on top of (or replaces) the tenant tag filter
  if (tag && !tenantId) where.tags = { has: tag };
  if (tag && tenantId) where.tags = { hasEvery: [`tenant:${tenantId}`, tag] };

  const findArgs: Record<string, unknown> = {
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
  };
  if (skip !== undefined) findArgs.skip = skip;

  const [workflows, total] = await Promise.all([
    (prisma as any).workflow.findMany(findArgs),
    (prisma as any).workflow.count({ where }),
  ]);

  // Return paginated response; include legacy nextCursor for backward compat
  const nextCursor = workflows.length === limit ? workflows[workflows.length - 1].id : null;
  res.json({
    workflows,
    pagination: {
      page: pageNum,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    // Legacy fields kept for backward compatibility
    items: workflows,
    nextCursor,
  });
});

// ── Import (must be before /:id to avoid route conflicts) ─────────────────────

router.post("/import", async (req: AuthRequest, res) => {
  const { name, nodes, edges } = req.body as { name: string; nodes: unknown; edges: unknown };
  if (!name || !Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: "invalid workflow JSON" });
  }
  const workflow = await prisma.workflow.create({
    data: {
      name: `${name} (imported)`,
      userId: req.userId!,
      nodes: nodes as object[],
      edges: edges as object[],
      active: false,
    },
  });
  res.status(201).json(workflow);
});

router.post("/", async (req: AuthRequest, res) => {
  const { name, nodes, edges, tags: bodyTags } = req.body;
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0 || name.length > 200)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }
  if (nodes !== undefined && !Array.isArray(nodes)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }
  if (edges !== undefined && !Array.isArray(edges)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }

  // Look up the user's tenantId so we can tag the workflow for tenant-scoped queries.
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { tenantId: true } });
  const baseTags: string[] = Array.isArray(bodyTags) ? bodyTags : [];
  const tenantTag = user?.tenantId ? `tenant:${user.tenantId}` : null;
  const tags = tenantTag && !baseTags.includes(tenantTag) ? [tenantTag, ...baseTags] : baseTags;

  const workflow = await (prisma as any).workflow.create({
    data: {
      name: (typeof name === "string" && name.trim()) ? name.trim() : "Untitled Workflow",
      userId: req.userId!,
      nodes: nodes || [],
      edges: edges || [],
      tags,
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
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0 || name.length > 200)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }
  if (nodes !== undefined && !Array.isArray(nodes)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }
  if (edges !== undefined && !Array.isArray(edges)) {
    return res.status(400).json({ error: "Invalid workflow data" });
  }
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

async function handleExecuteWorkflow(req: AuthRequest, res: import("express").Response) {
  // Lookup by userId OR by shared API key (for VISION triggers from other workflows)
  const apiKeyHeader = req.headers["authorization"]?.toString().replace(/^Bearer\s+/i, "");
  const isVisionInternalKey = apiKeyHeader && apiKeyHeader === process.env.WORKFLOW_API_KEY;

  const where = isVisionInternalKey
    ? { id: req.params.id }
    : { id: req.params.id, userId: req.userId! };

  const workflow = await prisma.workflow.findFirst({ where });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const triggerData = req.body.triggerData || req.body.data || {};
  const execution = await prisma.execution.create({
    data: { workflowId: workflow.id, status: "PENDING", data: { triggerData } },
  });

  await enqueueWorkflow({
    workflowId: workflow.id,
    executionId: execution.id,
    triggerData,
  });

  return res.status(202).json({ ...execution, jobId: execution.id });
}

// Primary execute endpoint (called from Editor UI)
router.post("/:id/execute", handleExecuteWorkflow);

// /run alias — called by VISION node when triggering sub-workflows
router.post("/:id/run", handleExecuteWorkflow);

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

// ── Execution History ─────────────────────────────────────────────────────

router.get("/:id/executions", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;

  const executions = await prisma.execution.findMany({
    where: {
      workflowId: req.params.id,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, status: true, startedAt: true, finishedAt: true, data: true },
  });

  const nextCursor = executions.length === limit ? executions[executions.length - 1].id : null;
  res.json({ items: executions, nextCursor });
});

router.get("/:id/executions/:execId", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const exec = await prisma.execution.findFirst({
    where: { id: req.params.execId, workflowId: req.params.id },
    include: { nodeLogs: { orderBy: { startedAt: "asc" } } },
  });
  if (!exec) return res.status(404).json({ error: "not found" });
  res.json(exec);
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
    .filter((e: { finishedAt: Date | null; startedAt: Date }) => e.finishedAt)
    .map((e: { finishedAt: Date | null; startedAt: Date }) => new Date(e.finishedAt!).getTime() - new Date(e.startedAt).getTime());
  const avgDurationMs = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : null;

  res.json({
    total,
    counts,
    successRate: successRate !== null ? Math.round(successRate * 10) / 10 : null,
    avgDurationMs: avgDurationMs !== null ? Math.round(avgDurationMs) : null,
  });
});

// ── PATCH (partial update — used by Schedules page for active toggle) ─────────

router.patch("/:id", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const allowed: Record<string, unknown> = {};
  if (req.body.active !== undefined) allowed.active = Boolean(req.body.active);
  if (req.body.name !== undefined) allowed.name = String(req.body.name);

  const updated = await prisma.workflow.update({
    where: { id: req.params.id },
    data: allowed,
  });
  res.json(updated);
});

// ── Export ─────────────────────────────────────────────────────────────────────

router.get("/:id/export", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Disposition", `attachment; filename="${workflow.name.replace(/\s/g, "_")}.hdv.json"`);
  res.json({
    version: "1.0",
    name: workflow.name,
    nodes: workflow.nodes,
    edges: workflow.edges,
    exportedAt: new Date().toISOString(),
  });
});

export { router as workflowsRouter };
