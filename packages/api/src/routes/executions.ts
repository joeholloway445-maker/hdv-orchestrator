import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

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

export { router as executionsRouter };
