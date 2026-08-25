import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

// All executions for this user (paginated)
router.get("/", async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor as string | undefined;

  // Get all workflow IDs for this user first
  const workflows = await prisma.workflow.findMany({
    where: { userId: req.userId! },
    select: { id: true },
  });
  const workflowIds = workflows.map((w) => w.id);

  const executions = await prisma.execution.findMany({
    where: { workflowId: { in: workflowIds }, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { workflow: { select: { id: true, name: true } } },
  });
  res.json(executions);
});

router.get("/workflow/:workflowId", async (req: AuthRequest, res) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id: req.params.workflowId, userId: req.userId! },
  });
  if (!workflow) return res.status(404).json({ error: "Not found" });

  const executions = await prisma.execution.findMany({
    where: { workflowId: req.params.workflowId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  res.json(executions);
});

router.get("/:id", async (req: AuthRequest, res) => {
  const execution = await prisma.execution.findUnique({
    where: { id: req.params.id },
    include: { nodeLogs: { orderBy: { startedAt: "asc" } } },
  });
  if (!execution) return res.status(404).json({ error: "Not found" });
  res.json(execution);
});

// Bulk delete — DELETE /executions?status=FAILED or ?olderThanDays=7
router.delete("/", async (req: AuthRequest, res) => {
  const workflows = await prisma.workflow.findMany({
    where: { userId: req.userId! },
    select: { id: true },
  });
  const workflowIds = workflows.map((w) => w.id);

  const where: Record<string, unknown> = { workflowId: { in: workflowIds } };

  if (req.query.status) {
    where.status = req.query.status as string;
  }
  if (req.query.olderThanDays) {
    const days = Number(req.query.olderThanDays);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    where.startedAt = { lt: cutoff };
  }

  const { count } = await prisma.execution.deleteMany({ where: where as Parameters<typeof prisma.execution.deleteMany>[0]["where"] });
  res.json({ deleted: count });
});

// Delete a specific execution
router.delete("/:id", async (req: AuthRequest, res) => {
  const execution = await prisma.execution.findUnique({
    where: { id: req.params.id },
    include: { workflow: { select: { userId: true } } },
  });
  if (!execution) return res.status(404).json({ error: "Not found" });
  if (execution.workflow.userId !== req.userId!) return res.status(403).json({ error: "Forbidden" });
  await prisma.execution.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Retry a failed execution — replays with original trigger data
router.post("/:id/retry", async (req: AuthRequest, res) => {
  const original = await prisma.execution.findUnique({
    where: { id: req.params.id },
    include: { workflow: true },
  });
  if (!original) return res.status(404).json({ error: "Not found" });
  if (original.workflow.userId !== req.userId!) return res.status(403).json({ error: "Forbidden" });

  const triggerData = (original.data as Record<string, unknown>)?.triggerData ?? {};
  const fresh = await prisma.execution.create({
    data: { workflowId: original.workflowId, status: "PENDING" },
  });
  await enqueueWorkflow({ workflowId: original.workflowId, executionId: fresh.id, triggerData: triggerData as Record<string, unknown> });
  res.status(201).json(fresh);
});

export { router as executionsRouter };
