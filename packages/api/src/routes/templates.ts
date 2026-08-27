import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest, verifyToken } from "../middleware/auth";
import { seedTemplates } from "../seed/templates";

const router = Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Type alias for the WorkflowTemplate table accessed via prisma.$queryRaw /
// prisma.$executeRaw — the generated client is not regenerated in this
// session, so we reach it through a typed cast.
// ---------------------------------------------------------------------------
type WorkflowTemplateRecord = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  nodes: unknown;
  edges: unknown;
  createdAt: Date;
};

function templateClient(p: PrismaClient) {
  return (p as unknown as {
    workflowTemplate: {
      findMany: (args: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
      }) => Promise<WorkflowTemplateRecord[]>;
      findUnique: (args: {
        where: { id: string };
      }) => Promise<WorkflowTemplateRecord | null>;
    };
  }).workflowTemplate;
}

// ---------------------------------------------------------------------------
// In-memory templates kept for the existing /:id/use route (backward compat).
// ---------------------------------------------------------------------------
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
  {
    id: "batch-process",
    name: "Batch Processing Pipeline",
    description: "Fetches a large list, splits it into chunks of 10, processes each batch with an HTTP call, then aggregates results.",
    tags: ["batch", "loop", "data"],
    nodes: [
      { id: "n1", type: "manualTrigger", position: { x: 60, y: 200 }, data: { label: "Start", nodeType: "manualTrigger", testData: '{"url": "https://jsonplaceholder.typicode.com/todos"}' } },
      { id: "n2", type: "httpRequest", position: { x: 260, y: 200 }, data: { label: "Fetch List", nodeType: "httpRequest", method: "GET", url: "https://jsonplaceholder.typicode.com/todos" } },
      { id: "n3", type: "set", position: { x: 460, y: 200 }, data: { label: "Wrap Array", nodeType: "set", mappings: [{ key: "items", value: "{{$input.body}}" }] } },
      { id: "n4", type: "splitBatches", position: { x: 660, y: 200 }, data: { label: "Split 10", nodeType: "splitBatches", arrayKey: "items", batchSize: "10", outputKey: "batch" } },
      { id: "n5", type: "aggregate", position: { x: 860, y: 200 }, data: { label: "Collect Results", nodeType: "aggregate", arrayKey: "batch", outputKey: "processed" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "ai-content-moderation",
    name: "AI Content Moderation",
    description: "Receives user-submitted content via webhook, checks it with AI for safety, and routes to approve or reject.",
    tags: ["ai", "webhook", "moderation"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 250 }, data: { label: "Submit Content", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "ai", position: { x: 280, y: 250 }, data: { label: "Moderate", nodeType: "ai", model: "claude-haiku-4-5-20251001", systemPrompt: "You are a content moderator. Review the text and reply with exactly one word: SAFE or UNSAFE.", userPrompt: "{{$input.body.content}}", maxTokens: "5" } },
      { id: "n3", type: "ifBranch", position: { x: 500, y: 250 }, data: { label: "Safe?", nodeType: "ifBranch", conditions: [{ field: "aiText", operator: "equals", value: "SAFE" }] } },
      { id: "n4", type: "respond", position: { x: 720, y: 100 }, data: { label: "Approved", nodeType: "respond", statusCode: "200", responseBody: '{"approved": true}' } },
      { id: "n5", type: "respond", position: { x: 720, y: 400 }, data: { label: "Rejected", nodeType: "respond", statusCode: "422", responseBody: '{"approved": false, "reason": "Content flagged by moderation"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4", sourceHandle: "true", label: "true" },
      { id: "e4", source: "n3", target: "n5", sourceHandle: "false", label: "false" },
    ],
  },
  {
    id: "scheduled-db-report",
    name: "Scheduled DB Report → Slack",
    description: "Runs a database query on a schedule, formats the result with AI, and posts a summary to Slack.",
    tags: ["schedule", "database", "slack", "ai"],
    nodes: [
      { id: "n1", type: "scheduleTrigger", position: { x: 60, y: 200 }, data: { label: "Daily 9am", nodeType: "scheduleTrigger", cronExpression: "0 9 * * *" } },
      { id: "n2", type: "database", position: { x: 280, y: 200 }, data: { label: "Query Stats", nodeType: "database", dialect: "postgres", host: "localhost", port: "5432", database: "mydb", user: "postgres", query: "SELECT status, COUNT(*) as count FROM orders WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY status", operation: "query" } },
      { id: "n3", type: "ai", position: { x: 500, y: 200 }, data: { label: "Format Report", nodeType: "ai", model: "claude-haiku-4-5-20251001", systemPrompt: "You create concise Slack-friendly business summaries. Use bullet points and emojis.", userPrompt: "Summarize this daily order report in 3-5 bullet points for the team Slack channel:\n\n{{$input.rows}}", maxTokens: "256" } },
      { id: "n4", type: "slack", position: { x: 720, y: 200 }, data: { label: "Post to Slack", nodeType: "slack", webhookUrl: "", text: "📊 *Daily Orders Report*\n\n{{$input.aiText}}", username: "ReportBot", iconEmoji: ":bar_chart:" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "regex-filter-enrich",
    name: "Regex Filter & Enrich",
    description: "Receives a list via webhook, filters items by regex pattern, enriches each match with an HTTP lookup, and responds.",
    tags: ["filter", "regex", "http", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "filter", position: { x: 280, y: 200 }, data: { label: "Filter by Email Pattern", nodeType: "filter", arrayKey: "body.users", conditions: [{ field: "email", operator: "matches", value: "^[a-z0-9._%+\\-]+@example\\.com$" }] } },
      { id: "n3", type: "transform", position: { x: 500, y: 200 }, data: { label: "Shape", nodeType: "transform", keepInput: false, mappings: [{ key: "matched", value: "{{$input.body.users}}" }, { key: "count", value: "{{$input._filterCount}}" }] } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "rss-dedup-email",
    name: "RSS Feed → Deduplicate → Email Digest",
    description: "Fetches an RSS feed on a schedule, removes duplicates by guid, and emails a digest of new items.",
    tags: ["rss", "deduplicate", "email", "schedule"],
    nodes: [
      { id: "n1", type: "scheduleTrigger", position: { x: 60, y: 200 }, data: { label: "Every 6 Hours", nodeType: "scheduleTrigger", cronExpression: "0 */6 * * *" } },
      { id: "n2", type: "rss", position: { x: 280, y: 200 }, data: { label: "Fetch Feed", nodeType: "rss", url: "https://hnrss.org/frontpage", outputField: "items", limit: "50" } },
      { id: "n3", type: "deduplicate", position: { x: 500, y: 200 }, data: { label: "Remove Seen", nodeType: "deduplicate", arrayKey: "items", dedupeField: "guid", strategy: "removeSubsequent" } },
      { id: "n4", type: "email", position: { x: 720, y: 200 }, data: { label: "Email Digest", nodeType: "email", to: "you@example.com", subject: "RSS Digest: {{$input.items.length}} new items", body2: "{{$input.items}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "webhook-sort-limit-respond",
    name: "Webhook → Sort & Limit → Respond",
    description: "Receives an array, sorts by a field descending, caps at 10 items, and returns the result.",
    tags: ["sort", "limit", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "sort", position: { x: 280, y: 200 }, data: { label: "Sort by Score", nodeType: "sort", arrayKey: "body.items", sortField: "score", direction: "desc" } },
      { id: "n3", type: "limit", position: { x: 500, y: 200 }, data: { label: "Top 10", nodeType: "limit", arrayKey: "body.items", maxItems: "10", keepFrom: "start" } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "xml-parse-transform",
    name: "HTTP → XML Parse → Transform → Respond",
    description: "Fetches an XML API response, parses it to JSON, extracts fields, and responds with clean data.",
    tags: ["xml", "http", "transform", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "httpRequest", position: { x: 280, y: 200 }, data: { label: "Fetch XML", nodeType: "httpRequest", method: "GET", url: "{{$input.body.url}}", contentType: "raw" } },
      { id: "n3", type: "xml", position: { x: 500, y: 200 }, data: { label: "Parse XML", nodeType: "xml", operation: "parse", inputField: "body", outputField: "parsed" } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input.parsed}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "rename-validate-respond",
    name: "Webhook → Rename Keys → Validate → Respond",
    description: "Normalizes incoming field names, validates the schema, and responds or routes to error branch.",
    tags: ["renameKeys", "validate", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Webhook In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "renameKeys", position: { x: 280, y: 200 }, data: { label: "Normalize Keys", nodeType: "renameKeys", mappings: [{ from: "body.user_id", to: "userId" }, { from: "body.first_name", to: "firstName" }, { from: "body.last_name", to: "lastName" }] } },
      { id: "n3", type: "validate", position: { x: 500, y: 200 }, data: { label: "Validate", nodeType: "validate", mode: "throw", rules: [{ field: "userId", type: "string", required: true }, { field: "firstName", type: "string", required: true }] } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond 200", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
      { id: "n5", type: "respond", position: { x: 720, y: 380 }, data: { label: "Respond 422", nodeType: "respond", statusCode: "422", responseBody: "{{$input.error}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n3", target: "n5", sourceHandle: "error" },
    ],
  },

  // ─── HDV Big Five Templates ───────────────────────────────────────────────
  {
    id: "hdv-secure-api-gateway",
    name: "HDV: Secure API Gateway",
    description: "Production-grade API endpoint: HOPE authenticates the JWT, KNOLL validates the payload for security violations, then the request passes to your business logic.",
    tags: ["hdv", "hope", "knoll", "security", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "API Webhook", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "hope", position: { x: 280, y: 200 }, data: { label: "HOPE Auth", nodeType: "hope", allowAnon: false, requiredRole: "", token: "{{$input.headers.authorization}}" } },
      { id: "n3", type: "knoll", position: { x: 500, y: 200 }, data: { label: "KNOLL Security", nodeType: "knoll", maxPayloadKb: "512", checkSsrf: true, checkEntropy: false } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Authorized Response", nodeType: "respond", statusCode: "200", responseBody: '{"ok": true, "userId": "{{$input.hopeUserId}}", "role": "{{$input.hopeRole}}"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "hdv-apex-moe-ai",
    name: "HDV: APEX Mixture-of-Experts AI",
    description: "Routes an AI task to the optimal Claude model via APEX MoE routing. Includes HOPE auth and KNOLL security gate. Replace the intent and category to match your use case.",
    tags: ["hdv", "apex", "hope", "knoll", "ai", "moe"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "AI Request", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "hope", position: { x: 280, y: 200 }, data: { label: "HOPE Auth", nodeType: "hope", allowAnon: false, token: "{{$input.headers.authorization}}" } },
      { id: "n3", type: "knoll", position: { x: 500, y: 200 }, data: { label: "KNOLL Gate", nodeType: "knoll", maxPayloadKb: "256", checkSsrf: true, checkEntropy: true } },
      { id: "n4", type: "apex", position: { x: 720, y: 200 }, data: { label: "APEX Router", nodeType: "apex", intent: "{{$input.body.message}}", category: "general", budgetTier: "medium" } },
      { id: "n5", type: "respond", position: { x: 940, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: '{"response": "{{$input.apexResponseText}}", "model": "{{$input.apexModel}}", "category": "{{$input.apexCategory}}"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "hdv-dream-simulate-score",
    name: "HDV: DREAM Simulate & Score",
    description: "Receives a workflow definition via webhook, runs DREAM simulation (dry-run without side effects), and scores its security and quality posture.",
    tags: ["hdv", "dream", "simulate", "score", "webhook"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Workflow Spec In", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "knoll", position: { x: 280, y: 200 }, data: { label: "KNOLL Gate", nodeType: "knoll", maxPayloadKb: "1024", checkSsrf: true } },
      { id: "n3", type: "dream", position: { x: 500, y: 200 }, data: { label: "DREAM Simulate", nodeType: "dream", mode: "simulate" } },
      { id: "n4", type: "respond", position: { x: 720, y: 200 }, data: { label: "Respond", nodeType: "respond", statusCode: "200", responseBody: "{{$input}}" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "hdv-vision-sub-trigger",
    name: "HDV: VISION Sub-Workflow Trigger",
    description: "Authenticated request triggers a named sub-workflow by ID via the VISION automation node. Use this to fan out to specialised workflows.",
    tags: ["hdv", "vision", "hope", "knoll", "sub-workflow"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 200 }, data: { label: "Trigger In", nodeType: "webhookTrigger", webhookId: "auto-replace" } },
      { id: "n2", type: "hope", position: { x: 280, y: 200 }, data: { label: "HOPE Auth", nodeType: "hope", allowAnon: false, token: "{{$input.headers.authorization}}" } },
      { id: "n3", type: "knoll", position: { x: 500, y: 200 }, data: { label: "KNOLL Gate", nodeType: "knoll", maxPayloadKb: "256", checkSsrf: true } },
      { id: "n4", type: "vision", position: { x: 720, y: 200 }, data: { label: "VISION Trigger", nodeType: "vision", visionMode: "trigger", workflowId: "REPLACE_WITH_WORKFLOW_ID", intent: "{{$input.body.intent}}", triggerData: "{{$input.body}}" } },
      { id: "n5", type: "respond", position: { x: 940, y: 200 }, data: { label: "Accepted", nodeType: "respond", statusCode: "202", responseBody: '{"accepted": true, "visionStatus": "{{$input.visionStatus}}"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "hdv-full-stack",
    name: "HDV: Full Stack — All Five Agents",
    description: "Canonical HDV pipeline: HOPE authenticates, KNOLL secures, APEX routes the AI task, DREAM scores the result, VISION triggers a follow-on workflow.",
    tags: ["hdv", "hope", "knoll", "apex", "dream", "vision", "full-stack"],
    nodes: [
      { id: "n1", type: "webhookTrigger", position: { x: 60, y: 300 }, data: { label: "Incoming Request", nodeType: "webhookTrigger", webhookId: "auto-replace", syncResponse: true } },
      { id: "n2", type: "hope", position: { x: 260, y: 300 }, data: { label: "HOPE: Auth Gate", nodeType: "hope", allowAnon: false, token: "{{$input.headers.authorization}}" } },
      { id: "n3", type: "knoll", position: { x: 460, y: 300 }, data: { label: "KNOLL: Security", nodeType: "knoll", maxPayloadKb: "512", checkSsrf: true, checkEntropy: true } },
      { id: "n4", type: "apex", position: { x: 660, y: 300 }, data: { label: "APEX: MoE Route", nodeType: "apex", intent: "{{$input.body.task}}", category: "general", budgetTier: "medium" } },
      { id: "n5", type: "dream", position: { x: 860, y: 200 }, data: { label: "DREAM: Score", nodeType: "dream", mode: "score" } },
      { id: "n6", type: "vision", position: { x: 860, y: 400 }, data: { label: "VISION: Follow-up", nodeType: "vision", visionMode: "noop" } },
      { id: "n7", type: "respond", position: { x: 1060, y: 300 }, data: { label: "Final Response", nodeType: "respond", statusCode: "200", responseBody: '{"ok": true, "model": "{{$input.apexModel}}", "userId": "{{$input.hopeUserId}}"}' } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
      { id: "e5", source: "n4", target: "n6" },
      { id: "e6", source: "n5", target: "n7" },
      { id: "e7", source: "n6", target: "n7" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Admin seed endpoint — must be registered before /:id routes
// ---------------------------------------------------------------------------

router.post("/seed", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const seeded = await seedTemplates(prisma);
    res.json({ seeded, message: `${seeded} built-in workflow templates seeded successfully` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Seed failed", detail: message });
  }
});

// ---------------------------------------------------------------------------
// GET /templates — list all DB-backed templates (public); supports ?category=
// and ?tier= query filters.
// ---------------------------------------------------------------------------

router.get("/", async (req, res) => {
  const category = req.query.category as string | undefined;
  const tier = req.query.tier as string | undefined;

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (tier) where.tier = tier;

  try {
    const templates = await templateClient(prisma).findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    res.json(templates);
  } catch {
    // Fallback to in-memory if the DB table doesn't exist yet (pre-migration)
    let items = TEMPLATES.map(({ nodes: _, edges: __, ...t }) => t);
    if (category) items = items.filter((t) => (t as Record<string, unknown>).category === category);
    if (tier) items = items.filter((t) => (t as Record<string, unknown>).tier === tier);
    res.json(items);
  }
});

// ---------------------------------------------------------------------------
// GET /templates/:id — full template (in-memory first, then DB)
// ---------------------------------------------------------------------------

router.get("/:id", async (req, res) => {
  // Check in-memory first (backward compat)
  const tpl = TEMPLATES.find((t) => t.id === req.params.id);
  if (tpl) return res.json(tpl);

  // Fall through to DB
  try {
    const dbTpl = await templateClient(prisma).findUnique({
      where: { id: req.params.id },
    });
    if (!dbTpl) return res.status(404).json({ error: "Template not found" });
    res.json(dbTpl);
  } catch {
    return res.status(404).json({ error: "Template not found" });
  }
});

// ---------------------------------------------------------------------------
// POST /templates/:id/use — create a new workflow from an in-memory template
// (auth required)
// ---------------------------------------------------------------------------

router.post("/:id/use", verifyToken, async (req: AuthRequest, res) => {
  const tpl = TEMPLATES.find((t) => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: "Template not found" });

  // Replace placeholder webhookIds with fresh UUIDs
  const { randomBytes } = await import("crypto");
  const nodes = tpl.nodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    if (d.nodeType === "webhookTrigger" && d.webhookId === "auto-replace") {
      return { ...n, data: { ...d, webhookId: randomBytes(8).toString("hex") } };
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

// ---------------------------------------------------------------------------
// POST /templates/:id/clone — clone a DB WorkflowTemplate into a new Workflow
// for the authenticated tenant (auth required)
// ---------------------------------------------------------------------------

router.post("/:id/clone", verifyToken, async (req: AuthRequest, res) => {
  let dbTpl: WorkflowTemplateRecord | null = null;

  try {
    dbTpl = await templateClient(prisma).findUnique({
      where: { id: req.params.id },
    });
  } catch {
    return res.status(503).json({ error: "Template store unavailable" });
  }

  if (!dbTpl) return res.status(404).json({ error: "Template not found" });

  // Look up the user's tenantId so we can tag the cloned workflow.
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { tenantId: true },
  });
  const tenantTag = user?.tenantId ? `tenant:${user.tenantId}` : null;
  const tags = [
    `template:${dbTpl.id}`,
    `category:${dbTpl.category}`,
    ...(tenantTag ? [tenantTag] : []),
  ];

  const workflow = await prisma.workflow.create({
    data: {
      name: dbTpl.name,
      userId: req.userId!,
      nodes: dbTpl.nodes as object[],
      edges: dbTpl.edges as object[],
      description: dbTpl.description,
      tags,
    },
  });

  res.status(201).json(workflow);
});

export { router as templatesRouter };
