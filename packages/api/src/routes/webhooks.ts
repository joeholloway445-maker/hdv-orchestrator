import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { enqueueWorkflow } from "../queue/producer";

const router = Router();
const prisma = new PrismaClient();

const SYNC_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

async function waitForWebhookResponse(executionId: string): Promise<{ statusCode: number; body: unknown } | null> {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const exec = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { status: true, data: true },
    });
    if (!exec) return null;
    if (exec.status === "RUNNING" || exec.status === "PENDING") continue;

    const data = exec.data as Record<string, unknown> | null;
    const webhookResp = data?.webhookResponse as { statusCode: number; body: unknown } | undefined;
    return webhookResp ?? null;
  }
  return null;
}

// POST /webhooks/trigger/:webhookId
router.post("/trigger/:webhookId", async (req, res) => {
  const workflows = await prisma.workflow.findMany({ where: { active: true } });

  let targetWorkflow = null;
  let syncResponse = false;

  for (const wf of workflows) {
    const nodes = wf.nodes as Array<{ type?: string; data?: Record<string, unknown> }>;
    const webhookNode = nodes.find(
      (n) =>
        (n.data?.nodeType === "webhookTrigger" || n.type === "webhookTrigger") &&
        n.data?.webhookId === req.params.webhookId
    );
    if (webhookNode) {
      targetWorkflow = wf;
      syncResponse = !!(webhookNode.data?.syncResponse);
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

  if (syncResponse) {
    const resp = await waitForWebhookResponse(execution.id);
    if (resp) {
      return res.status(resp.statusCode || 200).json(resp.body);
    }
    return res.status(504).json({ error: "Workflow timed out without responding" });
  }

  res.status(202).json({ executionId: execution.id, message: "Workflow triggered" });
});

export { router as webhooksRouter };
