import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
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

async function handleWebhook(req: import("express").Request, res: import("express").Response) {
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

  // Webhook auth check
  const nodes2 = targetWorkflow.nodes as Array<{ type?: string; data?: Record<string, unknown> }>;
  const triggerNode = nodes2.find(
    (n) => (n.data?.nodeType === "webhookTrigger" || n.type === "webhookTrigger") && n.data?.webhookId === req.params.webhookId
  );
  const authType = triggerNode?.data?.authType as string | undefined;
  if (authType && authType !== "none") {
    if (authType === "apikey") {
      const headerName = (triggerNode?.data?.authHeaderName as string) || "X-API-Key";
      const expected = triggerNode?.data?.authValue as string | undefined;
      const provided = req.headers[headerName.toLowerCase()] ?? req.query.apiKey;
      if (!expected || provided !== expected) return res.status(401).json({ error: "Unauthorized" });
    } else if (authType === "basic") {
      const authHeader = req.headers.authorization || "";
      const b64 = authHeader.replace(/^Basic\s+/i, "");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const expected = triggerNode?.data?.authValue as string | undefined; // "user:pass"
      if (!expected || decoded !== expected) return res.status(401).json({ error: "Unauthorized" });
    } else if (authType === "bearer") {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const expected = triggerNode?.data?.authValue as string | undefined;
      if (!expected || token !== expected) return res.status(401).json({ error: "Unauthorized" });
    } else if (authType === "hmac") {
      // HMAC-SHA256: sender signs the raw body with the shared secret and puts the
      // hex digest in a header (default: X-Hub-Signature-256, compatible with GitHub).
      const secret = triggerNode?.data?.authValue as string | undefined;
      const headerName = (triggerNode?.data?.authHeaderName as string) || "x-hub-signature-256";
      const provided = String(req.headers[headerName.toLowerCase()] || "").replace(/^sha256=/i, "");
      if (!secret || !provided) return res.status(401).json({ error: "Unauthorized" });
      const rawBody = JSON.stringify(req.body); // express.json already parsed; re-serialize for signature check
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      let match = false;
      try {
        match = timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
      } catch {
        match = false;
      }
      if (!match) return res.status(401).json({ error: "Unauthorized" });
    }
  }

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
}

// ---------------------------------------------------------------------------
// WebhookEndpoint CRUD — outbound webhook notification endpoints
// All routes below require the user to be authenticated (req.userId set by
// supabaseAuth / verifyToken middleware mounted in index.ts).
// ---------------------------------------------------------------------------

function isValidHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

// GET /webhooks/endpoints — list user's outbound webhook endpoints
router.get("/endpoints", async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId: req.userId } });
  res.json(endpoints);
});

// POST /webhooks/endpoints — create a new outbound webhook endpoint
router.post("/endpoints", async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const { url, secret, events } = req.body as { url?: string; secret?: string; events?: string[] };
  if (!url || !secret) return res.status(400).json({ error: "url and secret are required" });
  if (!isValidHttpsUrl(url)) return res.status(400).json({ error: "url must be a valid https:// URL" });
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      userId: req.userId,
      url,
      secret,
      ...(events ? { events } : {}),
    },
  });
  res.status(201).json(endpoint);
});

// PATCH /webhooks/endpoints/:id — update active/url/secret/events
router.patch("/endpoints/:id", async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const existing = await prisma.webhookEndpoint.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: "Not found" });
  const { url, secret, events, active } = req.body as { url?: string; secret?: string; events?: string[]; active?: boolean };
  if (url !== undefined && !isValidHttpsUrl(url)) return res.status(400).json({ error: "url must be a valid https:// URL" });
  const updated = await prisma.webhookEndpoint.update({
    where: { id: req.params.id },
    data: {
      ...(url !== undefined ? { url } : {}),
      ...(secret !== undefined ? { secret } : {}),
      ...(events !== undefined ? { events } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
  res.json(updated);
});

// DELETE /webhooks/endpoints/:id — delete an outbound webhook endpoint
router.delete("/endpoints/:id", async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const existing = await prisma.webhookEndpoint.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.userId) return res.status(404).json({ error: "Not found" });
  await prisma.webhookEndpoint.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Inbound webhook trigger list (legacy)
// ---------------------------------------------------------------------------

// GET /webhooks/list — authenticated: list all webhook triggers for current user
router.get("/list", async (req: AuthRequest, res) => {
  const workflows = await prisma.workflow.findMany({ where: { userId: req.userId! } });
  const webhooks: Array<{ workflowId: string; workflowName: string; webhookId: string; active: boolean; authType?: string }> = [];
  for (const wf of workflows) {
    const nodes = wf.nodes as Array<{ type?: string; data?: Record<string, unknown> }>;
    for (const node of nodes) {
      if (node.data?.nodeType === "webhookTrigger" || node.type === "webhookTrigger") {
        const wId = node.data?.webhookId as string | undefined;
        if (wId) {
          webhooks.push({
            workflowId: wf.id,
            workflowName: wf.name,
            webhookId: wId,
            active: wf.active,
            authType: (node.data?.authType as string | undefined) || "none",
          });
        }
      }
    }
  }
  res.json(webhooks);
});

// POST /webhooks/trigger/:webhookId
router.post("/trigger/:webhookId", handleWebhook);

// GET /webhooks/trigger/:webhookId  (for GET-based integrations)
router.get("/trigger/:webhookId", handleWebhook);

// PUT + DELETE for completeness
router.put("/trigger/:webhookId", handleWebhook);
router.delete("/trigger/:webhookId", handleWebhook);

export { router as webhooksRouter };
