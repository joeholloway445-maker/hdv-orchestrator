import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

const TEMPLATES = [
  {
    id: "http-to-email",
    name: "HTTP Fetch → Email Alert",
    description: "Fetches a URL on a schedule and emails you the result.",
    tags: ["email", "http", "schedule"],
    nodes: [
      { id: "n1", type: "scheduleTrigger", position: { x: 60, y: 200 }, data: { label: "Every Hour", nodeType: "scheduleTrigger", cronExpression: "0 * * * *" } },
      { id: "n2", type: "httpRequest", position: { x: 300, y: 200 }, data: { label: "Fetch Data", nodeType: "httpRequest", method: "GET", url: "https://httpbin.org/json" } },
      { id: "n3", type: "email", position: { x: 540, y: 200 }, data: { label: "Send Email", nodeType: "email", to: "you@example.com", subject: "Scheduled fetch result", body2: "{{$input.body}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
  {
    id: "webhook-transform-respond",
    name: "Webhook → Transform → Respond",
    description: "Receives a webhook, transforms the payload with a Code node, and responds synchronously.",
    tags: ["webhook", "code", "http"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "code", position: { x: 300, y: 200 }, data: { label: "Transform", nodeType: "code", code: "return { ...items[0].json, transformed: true, ts: Date.now() };" } },
      { id: "n3", type: "respond", position: { x: 540, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
  {
    id: "ai-summarizer",
    name: "Webhook → AI Summarize → Respond",
    description: "Receives text via webhook, summarizes it with AI, and returns the result.",
    tags: ["ai", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "ai", position: { x: 300, y: 200 }, data: { label: "AI Summarize", nodeType: "ai", userPrompt: "Summarize the following text concisely:\n\n{{$input.body.text}}", model: "claude-haiku-4-5-20251001" } },
      { id: "n3", type: "respond", position: { x: 540, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input.text}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
    ],
  },
  {
    id: "error-handler",
    name: "Error Handling Pattern",
    description: "Demonstrates using an error output edge to catch failures and log them.",
    tags: ["error", "pattern"],
    nodes: [
      { id: "n1", type: "manualTrigger", position: { x: 60, y: 200 }, data: { label: "Start", nodeType: "manualTrigger" } },
      { id: "n2", type: "httpRequest", position: { x: 300, y: 200 }, data: { label: "May Fail", nodeType: "httpRequest", method: "GET", url: "{{$input.url}}" } },
      { id: "n3", type: "set", position: { x: 540, y: 100 }, data: { label: "On Success", nodeType: "set", mappings: [{ key: "result", value: "ok" }] } },
      { id: "n4", type: "set", position: { x: 540, y: 300 }, data: { label: "On Error", nodeType: "set", mappings: [{ key: "result", value: "failed" }, { key: "error", value: "{{$input._error}}" }] } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n2", target: "n4", sourceHandle: "error", label: "error" },
    ],
  },
  {
    id: "data-pipeline",
    name: "Data Transform Pipeline",
    description: "Fetches a JSON array, filters items, sets new fields, and aggregates results.",
    tags: ["data", "transform", "filter"],
    nodes: [
      { id: "n1", type: "manualTrigger", position: { x: 60, y: 200 }, data: { label: "Start", nodeType: "manualTrigger", testData: '{"url": "https://jsonplaceholder.typicode.com/todos"}' } },
      { id: "n2", type: "httpRequest", position: { x: 280, y: 200 }, data: { label: "Fetch Todos", nodeType: "httpRequest", method: "GET", url: "https://jsonplaceholder.typicode.com/todos" } },
      { id: "n3", type: "set", position: { x: 500, y: 200 }, data: { label: "Extract Items", nodeType: "set", mappings: [{ key: "items", value: "{{$input.body}}" }] } },
      { id: "n4", type: "filter", position: { x: 720, y: 200 }, data: { label: "Completed Only", nodeType: "filter", arrayKey: "items", condition: "item.completed === true" } },
      { id: "n5", type: "aggregate", position: { x: 940, y: 200 }, data: { label: "Count", nodeType: "aggregate", arrayKey: "items" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
];

// GET /templates — public list
router.get("/", (_req, res) => {
  res.json(TEMPLATES.map(({ nodes: _, edges: __, ...t }) => t));
});

// GET /templates/:id — full template
router.get("/:id", (_req, res) => {
  const tpl = TEMPLATES.find((t) => t.id === _req.params.id);
  if (!tpl) return res.status(404).json({ error: "Template not found" });
  res.json(tpl);
});

// POST /templates/:id/use — create a new workflow from template
router.post("/:id/use", async (req: AuthRequest, res) => {
  const tpl = TEMPLATES.find((t) => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: "Template not found" });

  // Replace placeholder webhookIds with fresh UUIDs
  const { randomBytes } = await import("crypto");
  const nodes = tpl.nodes.map((n) => {
    if ((n.data.nodeType === "webhookTrigger") && n.data.webhookId === "auto-replace") {
      return { ...n, data: { ...n.data, webhookId: randomBytes(8).toString("hex") } };
    }
    return n;
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: tpl.name,
      userId: req.userId!,
      nodes,
      edges: tpl.edges,
      tags: tpl.tags,
      description: tpl.description,
    },
  });
  res.status(201).json(workflow);
});

export { router as templatesRouter };
