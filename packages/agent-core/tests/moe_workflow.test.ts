/**
 * tests/moe_workflow.test.ts — Unit tests for APEX MoE routing and
 * workflow_route handler logic in hdv-agent-core.
 *
 * Tests heuristicRoute in isolation (no WS server, no network).
 * Also tests the workflow_route response shape by reproducing the handler
 * inline — mirrors what the WS server executes for "workflow_route" messages.
 *
 * Run: node --require ts-node/register --test tests/moe_workflow.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { heuristicRoute } from "../src/agents/Apex";

// ── heuristicRoute — all category/budget combinations ───────────────────────

describe("heuristicRoute — model selection", () => {
  test("security/high → opus", () => {
    assert.strictEqual(heuristicRoute("audit this", "security", "high"), "claude-opus-5");
  });

  test("security/medium → sonnet", () => {
    assert.strictEqual(heuristicRoute("audit this", "security", "medium"), "claude-sonnet-5");
  });

  test("audit/high → opus", () => {
    assert.strictEqual(heuristicRoute("full audit", "audit", "high"), "claude-opus-5");
  });

  test("code/low → haiku", () => {
    assert.strictEqual(heuristicRoute("fix bug", "code", "low"), "claude-haiku-4-5-20251001");
  });

  test("code/high → opus", () => {
    assert.strictEqual(heuristicRoute("deep refactor", "code", "high"), "claude-opus-5");
  });

  test("analysis/medium → sonnet", () => {
    assert.strictEqual(heuristicRoute("analyze trends", "analysis", "medium"), "claude-sonnet-5");
  });

  test("creative/high → fable", () => {
    assert.strictEqual(heuristicRoute("write a story", "creative", "high"), "claude-fable-5");
  });

  test("simulation/high → fable", () => {
    assert.strictEqual(heuristicRoute("simulate scenario", "simulation", "high"), "claude-fable-5");
  });

  test("vision/low → sonnet", () => {
    assert.strictEqual(heuristicRoute("describe image", "vision", "low"), "claude-sonnet-5");
  });

  test("multimodal/high → sonnet", () => {
    assert.strictEqual(heuristicRoute("process frame", "multimodal", "high"), "claude-sonnet-5");
  });

  test("chat/low → haiku", () => {
    assert.strictEqual(heuristicRoute("hello", "chat", "low"), "claude-haiku-4-5-20251001");
  });

  test("support/low → haiku", () => {
    assert.strictEqual(heuristicRoute("help me", "support", "low"), "claude-haiku-4-5-20251001");
  });

  test("default with 'audit' keyword → opus", () => {
    assert.strictEqual(heuristicRoute("audit all policies", "general", "medium"), "claude-opus-5");
  });

  test("default with 'knoll' keyword → opus", () => {
    assert.strictEqual(heuristicRoute("run knoll check", "general", "medium"), "claude-opus-5");
  });

  test("default with 'dream' keyword → fable", () => {
    assert.strictEqual(heuristicRoute("dream up a scene", "general", "medium"), "claude-fable-5");
  });

  test("default with 'creat' keyword → fable", () => {
    assert.strictEqual(heuristicRoute("create a story", "general", "medium"), "claude-fable-5");
  });

  test("default with 'debug' keyword → sonnet", () => {
    assert.strictEqual(heuristicRoute("debug this path", "general", "medium"), "claude-sonnet-5");
  });

  test("default with 'refactor' keyword → sonnet", () => {
    assert.strictEqual(heuristicRoute("refactor the module", "general", "medium"), "claude-sonnet-5");
  });

  test("default low budget → haiku", () => {
    assert.strictEqual(heuristicRoute("do something", "general", "low"), "claude-haiku-4-5-20251001");
  });

  test("default medium budget → sonnet", () => {
    assert.strictEqual(heuristicRoute("do something", "general", "medium"), "claude-sonnet-5");
  });
});

// ── workflow_route handler simulation ────────────────────────────────────────
// Mirrors the case "workflow_route" block in server.ts so it can be tested
// without starting a WS server.

function handleWorkflowRoute(payload: Record<string, unknown>): {
  model: string;
  category: string;
  budgetTier: string;
  reasoning: string;
} {
  const intent = String(payload.intent ?? "");
  const category = String(payload.category ?? "general");
  const budgetTier = (payload.budgetTier ?? "medium") as "low" | "medium" | "high";
  const model = heuristicRoute(intent, category, budgetTier);
  return {
    model,
    category,
    budgetTier,
    reasoning: `Heuristic: category="${category}" budget="${budgetTier}" → ${model}`,
  };
}

describe("workflow_route handler", () => {
  test("returns correct model for security/high intent", () => {
    const result = handleWorkflowRoute({ intent: "audit config", category: "security", budgetTier: "high" });
    assert.strictEqual(result.model, "claude-opus-5");
    assert.strictEqual(result.category, "security");
    assert.strictEqual(result.budgetTier, "high");
  });

  test("reasoning includes category and budget", () => {
    const result = handleWorkflowRoute({ intent: "write a story", category: "creative", budgetTier: "high" });
    assert.ok(result.reasoning.includes("creative"));
    assert.ok(result.reasoning.includes("high"));
    assert.ok(result.reasoning.includes("claude-fable-5"));
  });

  test("defaults to general/medium when fields omitted", () => {
    const result = handleWorkflowRoute({});
    assert.strictEqual(result.category, "general");
    assert.strictEqual(result.budgetTier, "medium");
    assert.ok(result.model.length > 0);
  });

  test("code/low → haiku", () => {
    const result = handleWorkflowRoute({ intent: "fix bug", category: "code", budgetTier: "low" });
    assert.strictEqual(result.model, "claude-haiku-4-5-20251001");
  });

  test("vision/medium → sonnet", () => {
    const result = handleWorkflowRoute({ intent: "describe frame", category: "vision", budgetTier: "medium" });
    assert.strictEqual(result.model, "claude-sonnet-5");
  });
});
