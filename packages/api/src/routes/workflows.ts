import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req: AuthRequest, res) => {
  const workflows = await prisma.workflow.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { executions: true } },
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { status: true, startedAt: true },
      },
    },
  });
  res.json(workflows);
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
  const { name, nodes, edges, active, errorWorkflowId } = req.body;
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const updated = await (prisma as any).workflow.update({
    where: { id: req.params.id },
    data: { name, nodes, edges, active, ...(errorWorkflowId !== undefined ? { errorWorkflowId } : {}) },
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

export { router as workflowsRouter };
