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
      { id: "n4", type: "filter", position: { x: 720, y: 200 }, data: { label: "Completed Only", nodeType: "filter", arrayKey: "items", conditions: [{ field: "completed", operator: "isTrue", value: "" }] } },
      { id: "n5", type: "aggregate", position: { x: 940, y: 200 }, data: { label: "Count", nodeType: "aggregate", arrayKey: "items" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "validate-and-branch",
    name: "Validate & Branch on Result",
    description: "Validates webhook payload fields, then routes to success or error handling based on validation outcome.",
    tags: ["validate", "if", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace" } },
      { id: "n2", type: "validate", position: { x: 280, y: 200 }, data: { label: "Validate", nodeType: "validate", mode: "flag", rules: [{ field: "body.email", required: true, type: "string" }, { field: "body.name", required: true, type: "string" }] } },
      { id: "n3", type: "ifBranch", position: { x: 500, y: 200 }, data: { label: "Valid?", nodeType: "ifBranch", conditions: [{ field: "_validationPassed", operator: "isTrue", value: "" }] } },
      { id: "n4", type: "respond", position: { x: 720, y: 100 }, data: { label: "OK Response", nodeType: "respond", statusCode: "200", responseBody: '{"ok": true}' } },
      { id: "n5", type: "respond", position: { x: 720, y: 300 }, data: { label: "Error Response", nodeType: "respond", statusCode: "400", responseBody: '{"ok": false, "errors": "{{$input._validationErrors}}"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", sourceHandle: "true", label: "true" },
      { id: "e4", source: "n3", target: "n5", sourceHandle: "false", label: "false" },
    ],
  },
  {
    id: "ai-classify-route",
    name: "AI Classifier → Route",
    description: "Receives text via webhook, classifies it with AI (positive/negative/neutral), then routes to different handlers.",
    tags: ["ai", "switch", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 250 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "ai", position: { x: 280, y: 250 }, data: { label: "Classify", nodeType: "ai", model: "claude-haiku-4-5-20251001", systemPrompt: "Classify the sentiment of the user's text. Reply with exactly one word: positive, negative, or neutral.", userPrompt: "{{$input.body.text}}", maxTokens: "10" } },
      { id: "n3", type: "switch", position: { x: 500, y: 250 }, data: { label: "Route by Sentiment", nodeType: "switch", field: "{{$input.aiText}}", cases: [{ value: "positive", output: "positive" }, { value: "negative", output: "negative" }], defaultOutput: "neutral" } },
      { id: "n4", type: "respond", position: { x: 720, y: 100 }, data: { label: "Positive", nodeType: "respond", statusCode: "200", responseBody: '{"sentiment": "positive", "score": 1}' } },
      { id: "n5", type: "respond", position: { x: 720, y: 250 }, data: { label: "Negative", nodeType: "respond", statusCode: "200", responseBody: '{"sentiment": "negative", "score": -1}' } },
      { id: "n6", type: "respond", position: { x: 720, y: 400 }, data: { label: "Neutral", nodeType: "respond", statusCode: "200", responseBody: '{"sentiment": "neutral", "score": 0}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", sourceHandle: "positive", label: "positive" },
      { id: "e4", source: "n3", target: "n5", sourceHandle: "negative", label: "negative" },
      { id: "e5", source: "n3", target: "n6", sourceHandle: "neutral", label: "neutral" },
    ],
  },
  {
    id: "slack-alert",
    name: "Webhook → Slack Alert",
    description: "Receives a webhook and posts a formatted message to Slack. Good for alert routing and notifications.",
    tags: ["slack", "webhook", "notifications"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace" } },
      { id: "n2", type: "slack", position: { x: 300, y: 200 }, data: { label: "Send Slack", nodeType: "slack", webhookUrl: "", text: "Alert: {{$input.body.message}} — at {{$now}}", username: "Workflow Bot", iconEmoji: ":bell:" } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  },
  {
    id: "db-query-respond",
    name: "Webhook → DB Query → Respond",
    description: "Receives a webhook, queries Postgres for a record by ID, and returns the result as a JSON response.",
    tags: ["database", "webhook", "postgres"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "database", position: { x: 300, y: 200 }, data: { label: "Query DB", nodeType: "database", dialect: "postgres", host: "localhost", port: "5432", database: "mydb", user: "postgres", query: "SELECT * FROM users WHERE id = '{{$input.body.id}}' LIMIT 1", operation: "query" } },
      { id: "n3", type: "respond", position: { x: 540, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }, { id: "e2", source: "n2", target: "n3" }],
  },
  {
    id: "crypto-hash-pipeline",
    name: "Hash & Transform Pipeline",
    description: "Receives data via webhook, hashes a field with SHA-256, transforms the output, and responds.",
    tags: ["crypto", "transform", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "crypto", position: { x: 280, y: 200 }, data: { label: "Hash Email", nodeType: "crypto", operation: "sha256", inputField: "{{$input.body.email}}", outputField: "emailHash", encoding: "hex" } },
      { id: "n3", type: "transform", position: { x: 500, y: 200 }, data: { label: "Shape Output", nodeType: "transform", keepInput: false, mappings: [{ key: "id", value: "{{$input.emailHash}}" }, { key: "timestamp", value: "{{$now}}" }] } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
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
