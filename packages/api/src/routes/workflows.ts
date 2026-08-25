import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;

  const workflows = await prisma.workflow.findMany({
    where: { userId: req.userId!, ...(cursor ? { id: { lt: cursor } } : {}) },
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

export { router as workflowsRouter };
