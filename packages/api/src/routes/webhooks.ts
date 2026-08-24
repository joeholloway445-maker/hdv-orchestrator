import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

// POST /webhooks/trigger/:webhookId
router.post("/trigger/:webhookId", async (req, res) => {
  const workflows = await prisma.workflow.findMany({ where: { active: true } });

  let targetWorkflow = null;
  for (const wf of workflows) {
    const nodes = wf.nodes as Array<{ type?: string; data?: Record<string, unknown> }>;
    const webhookNode = nodes.find(
      (n) =>
        (n.data?.nodeType === "webhookTrigger" || n.type === "webhookTrigger") &&
        n.data?.webhookId === req.params.webhookId
    );
    if (webhookNode) {
      targetWorkflow = wf;
      break;
    }
  }

  if (!targetWorkflow) return res.status(404).json({ error: "Webhook not found or workflow inactive" });

  const execution = await prisma.execution.create({
    data: { workflowId: targetWorkflow.id, status: "PENDING" },
  });

  await enqueueWorkflow({
    workflowId: targetWorkflow.id,
    executionId: execution.id,
    triggerData: { body: req.body, headers: req.headers, query: req.query },
  });

  res.status(202).json({ executionId: execution.id, message: "Workflow triggered" });
});

export { router as webhooksRouter };
