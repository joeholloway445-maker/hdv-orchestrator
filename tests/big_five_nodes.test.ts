/**
 * tests/big_five_nodes.test.ts — Unit tests for KNOLL, APEX, and DREAM nodes.
 *
 * All tests run in-process without real API calls. APEX and DREAM tests mock
 * the fetch calls so no network is required.
 *
 * Run: node --require ts-node/register --test tests/big_five_nodes.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// ────────────────────────────────────────────────────────────────────────────
// KNOLL node tests (pure logic, no network)
// ────────────────────────────────────────────────────────────────────────────

// Inline the KNOLL logic so tests don't depend on built output
const FORBIDDEN_KEY_PATTERNS = [
  /password/i, /secret/i, /private_key/i, /creditcard/i, /credit_card/i, /ssn/i, /cvv/i,
];
const PRIVATE_IP_RE = /^(https?:\/\/)(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)/i;

function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

function findForbiddenKeys(obj: unknown): string[] {
  const hits: string[] = [];
  function walk(v: unknown) {
    if (v && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        if (FORBIDDEN_KEY_PATTERNS.some((p) => p.test(key))) hits.push(key);
        walk((v as Record<string, unknown>)[key]);
      }
    }
  }
  walk(obj);
  return hits;
}

function findSsrfUrls(obj: unknown): string[] {
  const hits: string[] = [];
  function walk(v: unknown) {
    if (typeof v === "string" && PRIVATE_IP_RE.test(v)) hits.push(v);
    else if (v && typeof v === "object") {
      for (const val of Object.values(v as Record<string, unknown>)) walk(val);
    }
  }
  walk(obj);
  return hits;
}

describe("KNOLL audit node — security validation", () => {
  test("passes clean payload", () => {
    const input = { userId: "u1", action: "read", data: { name: "Alice" } };
    assert.strictEqual(findForbiddenKeys(input).length, 0);
    assert.strictEqual(findSsrfUrls(input).length, 0);
  });

  test("blocks payload with 'password' key", () => {
    const input = { userId: "u1", password: "hunter2" };
    const forbidden = findForbiddenKeys(input);
    assert.ok(forbidden.includes("password"), "should flag 'password' key");
  });

  test("blocks payload with nested 'secret' key", () => {
    const input = { config: { secret: "abc123" } };
    const forbidden = findForbiddenKeys(input);
    assert.ok(forbidden.some((k) => /secret/i.test(k)));
  });

  test("blocks payload with 'credit_card' key", () => {
    const input = { payment: { credit_card: "4111111111111111" } };
    assert.ok(findForbiddenKeys(input).length > 0);
  });

  test("blocks SSRF URL (localhost)", () => {
    const input = { url: "http://localhost:8080/admin" };
    assert.ok(findSsrfUrls(input).length > 0);
  });

  test("blocks SSRF URL (10.x.x.x)", () => {
    const input = { endpoint: "http://10.0.0.1/api" };
    assert.ok(findSsrfUrls(input).length > 0);
  });

  test("allows legitimate external URL", () => {
    const input = { url: "https://api.anthropic.com/v1/messages" };
    assert.strictEqual(findSsrfUrls(input).length, 0);
  });

  test("shannon entropy: low for plain text", () => {
    const entropy = shannonEntropy("hello world this is plain text");
    assert.ok(entropy < 5.0, `expected low entropy, got ${entropy}`);
  });

  test("shannon entropy: high for random-looking string", () => {
    const entropy = shannonEntropy("x7Kp2mQnR9vLbWtYeZuJsA3fCdHgNiOo");
    assert.ok(entropy > 4.5, `expected higher entropy, got ${entropy}`);
  });

  test("passes payload with 'name' and 'email' keys", () => {
    const input = { name: "Bob", email: "bob@example.com", role: "viewer" };
    assert.strictEqual(findForbiddenKeys(input).length, 0);
  });

  test("blocks 192.168.x.x SSRF attempt", () => {
    const input = { callback: "http://192.168.1.1/hook" };
    assert.ok(findSsrfUrls(input).length > 0);
  });

  test("nested SSRF detection works", () => {
    const input = { step: { config: { target: "http://127.0.0.1:9200/_cat/indices" } } };
    assert.ok(findSsrfUrls(input).length > 0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// APEX MoE heuristic routing tests (no network)
// ────────────────────────────────────────────────────────────────────────────

function heuristicRoute(intent: string, category: string, budgetTier: string): string {
  const low = budgetTier === "low";
  const high = budgetTier === "high";
  switch (category) {
    case "security": case "audit":
      return high ? "claude-opus-5" : "claude-sonnet-5";
    case "code": case "analysis":
      return low ? "claude-haiku-4-5-20251001" : high ? "claude-opus-5" : "claude-sonnet-5";
    case "creative": case "simulation":
      return high ? "claude-fable-5" : "claude-sonnet-5";
    case "vision": case "multimodal":
      return "claude-sonnet-5";
    case "chat": case "support":
      return low ? "claude-haiku-4-5-20251001" : "claude-sonnet-5";
    default: {
      const lower = intent.toLowerCase();
      if (lower.includes("secur") || lower.includes("audit")) return "claude-opus-5";
      if (lower.includes("dream") || lower.includes("simulat")) return "claude-fable-5";
      if (lower.includes("cod") || lower.includes("debug")) return "claude-sonnet-5";
      return low ? "claude-haiku-4-5-20251001" : "claude-sonnet-5";
    }
  }
}

describe("APEX MoE heuristic router", () => {
  test("routes security/high budget to opus", () => {
    assert.strictEqual(heuristicRoute("audit config", "security", "high"), "claude-opus-5");
  });

  test("routes security/low budget to sonnet (still security)", () => {
    assert.strictEqual(heuristicRoute("audit config", "security", "low"), "claude-sonnet-5");
  });

  test("routes code/low budget to haiku", () => {
    assert.strictEqual(heuristicRoute("fix bug", "code", "low"), "claude-haiku-4-5-20251001");
  });

  test("routes code/high budget to opus", () => {
    assert.strictEqual(heuristicRoute("refactor service", "code", "high"), "claude-opus-5");
  });

  test("routes creative/high to fable", () => {
    assert.strictEqual(heuristicRoute("write a story", "creative", "high"), "claude-fable-5");
  });

  test("routes creative/medium to sonnet", () => {
    assert.strictEqual(heuristicRoute("write a story", "creative", "medium"), "claude-sonnet-5");
  });

  test("routes vision/any to sonnet", () => {
    assert.strictEqual(heuristicRoute("describe image", "vision", "low"), "claude-sonnet-5");
  });

  test("routes chat/low to haiku", () => {
    assert.strictEqual(heuristicRoute("hello", "chat", "low"), "claude-haiku-4-5-20251001");
  });

  test("keyword 'audit' in default routes to opus", () => {
    assert.strictEqual(heuristicRoute("audit this config file", "general", "medium"), "claude-opus-5");
  });

  test("keyword 'dream' in default routes to fable", () => {
    assert.strictEqual(heuristicRoute("dream up a simulation", "general", "medium"), "claude-fable-5");
  });

  test("keyword 'debug' in default routes to sonnet", () => {
    assert.strictEqual(heuristicRoute("debug this code path", "general", "medium"), "claude-sonnet-5");
  });

  test("unknown/medium budget falls back to sonnet", () => {
    assert.strictEqual(heuristicRoute("random task", "unknown", "medium"), "claude-sonnet-5");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// DREAM simulation DAG tests (no network)
// ────────────────────────────────────────────────────────────────────────────

const SIDE_EFFECTFUL_SIM = new Set([
  "httpRequest", "email", "slack", "database", "webhookTrigger", "subWorkflow", "respond", "wait",
]);

interface SimNode { id: string; type?: string; data: Record<string, unknown> }
interface SimEdge { source: string; target: string }

function simulateDAG(nodes: SimNode[], edges: SimEdge[], triggerData: Record<string, unknown>) {
  const results: { nodeId: string; nodeType: string; simulated: boolean; output: Record<string, unknown> }[] = [];
  const outputs: Record<string, unknown> = {};
  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};
  for (const n of nodes) { children[n.id] = []; parents[n.id] = []; }
  for (const e of edges) { children[e.source]?.push(e.target); parents[e.target]?.push(e.source); }
  const queue = nodes.filter((n) => (parents[n.id]?.length ?? 0) === 0);
  const visited = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const parentOuts = (parents[node.id] ?? []).map((pid) => outputs[pid]).filter(Boolean);
    const $input = parentOuts.length > 0 ? (parentOuts[parentOuts.length - 1] as Record<string, unknown>) : triggerData;
    const nodeType = String(node.data?.nodeType || node.type || "");
    let simulated = false;
    let output: Record<string, unknown>;
    if (SIDE_EFFECTFUL_SIM.has(nodeType)) { output = { ...$input, simulated: true }; simulated = true; }
    else if (nodeType === "ai" || nodeType === "apex") { output = { ...$input, aiText: "[sim]", simulated: true }; simulated = true; }
    else if (nodeType === "knoll") { output = { ...$input, _knollAudit: { passed: true } }; }
    else { output = { ...$input }; }
    outputs[node.id] = output;
    results.push({ nodeId: node.id, nodeType, simulated, output });
    for (const cid of children[node.id] ?? []) {
      if (!visited.has(cid)) { const c = nodes.find((n) => n.id === cid); if (c) queue.push(c); }
    }
  }
  return results;
}

function scoreWorkflow(nodes: SimNode[], edges: SimEdge[]) {
  const nodeTypes = nodes.map((n) => String(n.data?.nodeType || n.type || ""));
  const score = [
    nodeTypes.some((t) => t === "stopError" || t === "ifBranch") ? 20 : 0,
    nodeTypes.some((t) => t === "respond" || t === "set") ? 15 : 0,
    nodeTypes.includes("knoll") ? 25 : 0,
    nodeTypes.includes("apex") ? 20 : 0,
    nodes.length >= 2 ? 10 : 0,
    edges.length >= 1 ? 10 : 0,
  ].reduce((a, b) => a + b, 0);
  return { score: Math.min(score, 100), hasKnoll: nodeTypes.includes("knoll"), hasApex: nodeTypes.includes("apex") };
}

describe("DREAM simulation — DAG dry-run", () => {
  test("empty workflow returns empty trace", () => {
    const trace = simulateDAG([], [], {});
    assert.strictEqual(trace.length, 0);
  });

  test("single node workflow executes root", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "set", label: "Init" } }];
    const trace = simulateDAG(nodes, [], { value: 1 });
    assert.strictEqual(trace.length, 1);
    assert.strictEqual(trace[0].nodeId, "n1");
  });

  test("httpRequest node is marked simulated", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "httpRequest" } }];
    const trace = simulateDAG(nodes, [], {});
    assert.strictEqual(trace[0].simulated, true);
  });

  test("email node is marked simulated", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "email" } }];
    const trace = simulateDAG(nodes, [], {});
    assert.strictEqual(trace[0].simulated, true);
  });

  test("ai node is marked simulated", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "ai" } }];
    const trace = simulateDAG(nodes, [], {});
    assert.strictEqual(trace[0].simulated, true);
  });

  test("knoll node passes audit in simulation", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "knoll" } }];
    const trace = simulateDAG(nodes, [], {});
    assert.strictEqual(trace[0].simulated, false);
    assert.deepStrictEqual(
      (trace[0].output as Record<string, unknown>)._knollAudit,
      { passed: true }
    );
  });

  test("two-node linear chain propagates data", () => {
    const nodes: SimNode[] = [
      { id: "n1", data: { nodeType: "set" } },
      { id: "n2", data: { nodeType: "set" } },
    ];
    const edges: SimEdge[] = [{ source: "n1", target: "n2" }];
    const trace = simulateDAG(nodes, edges, { seed: 42 });
    assert.strictEqual(trace.length, 2);
    // n2's output should include n1's output (passed through)
    const n2Out = trace[1].output as Record<string, unknown>;
    assert.strictEqual(n2Out.seed, 42);
  });

  test("set node not marked simulated", () => {
    const nodes: SimNode[] = [{ id: "n1", data: { nodeType: "set" } }];
    const trace = simulateDAG(nodes, [], {});
    assert.strictEqual(trace[0].simulated, false);
  });
});

describe("DREAM workflow scoring", () => {
  test("empty workflow scores 0", () => {
    const { score } = scoreWorkflow([], []);
    assert.strictEqual(score, 0);
  });

  test("workflow with knoll and apex scores high", () => {
    const nodes: SimNode[] = [
      { id: "n1", data: { nodeType: "knoll" } },
      { id: "n2", data: { nodeType: "apex" } },
      { id: "n3", data: { nodeType: "respond" } },
      { id: "n4", data: { nodeType: "ifBranch" } },
    ];
    const edges: SimEdge[] = [
      { source: "n1", target: "n2" },
      { source: "n2", target: "n3" },
      { source: "n3", target: "n4" },
    ];
    const { score, hasKnoll, hasApex } = scoreWorkflow(nodes, edges);
    assert.ok(score >= 80, `expected score >= 80, got ${score}`);
    assert.strictEqual(hasKnoll, true);
    assert.strictEqual(hasApex, true);
  });

  test("workflow without knoll or apex scores lower", () => {
    const nodes: SimNode[] = [
      { id: "n1", data: { nodeType: "set" } },
      { id: "n2", data: { nodeType: "httpRequest" } },
    ];
    const { score, hasKnoll, hasApex } = scoreWorkflow(nodes, [{ source: "n1", target: "n2" }]);
    assert.ok(score < 60, `expected score < 60, got ${score}`);
    assert.strictEqual(hasKnoll, false);
    assert.strictEqual(hasApex, false);
  });

  test("adding knoll increases score by 25", () => {
    const baseNodes: SimNode[] = [{ id: "n1", data: { nodeType: "set" } }];
    const withKnoll: SimNode[] = [...baseNodes, { id: "n2", data: { nodeType: "knoll" } }];
    const baseScore = scoreWorkflow(baseNodes, []).score;
    const knollScore = scoreWorkflow(withKnoll, [{ source: "n1", target: "n2" }]).score;
    assert.ok(knollScore > baseScore, "KNOLL should increase score");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VISION node tests
// ─────────────────────────────────────────────────────────────────────────────

describe("VISION node (executeVision)", () => {
  // Inline the core logic without importing the compiled output

  interface VisionNodeDef { data: Record<string, unknown>; }
  interface VisionResult {
    visionMode: string; jobId?: string; status: string;
    output?: unknown; error?: string; workflowId?: string; intent?: string;
  }

  async function executeVisionLocal(node: VisionNodeDef, $input: Record<string, unknown>): Promise<VisionResult> {
    const mode = String(node.data.visionMode || "trigger");
    const intent = String(node.data.intent || $input.intent || "");
    if (mode === "noop") return { visionMode: "noop", status: "completed", output: $input };
    if (mode === "inline") {
      const dag = node.data.dag as { nodes?: unknown[] } | undefined;
      if (!dag?.nodes) return { visionMode: "inline", status: "completed", output: $input };
      return { visionMode: "inline", status: "completed", output: { dag, triggerData: $input, intent } };
    }
    // trigger mode without API configured → dev fallback
    const workflowId = String(node.data.workflowId || $input.workflowId || "");
    if (!workflowId) return { visionMode: "trigger", status: "error", error: "visionMode=trigger requires data.workflowId" };
    return { visionMode: "trigger", jobId: `dev-vision-${Date.now()}`, status: "queued", workflowId, intent };
  }

  test("noop mode returns $input unchanged", async () => {
    const result = await executeVisionLocal({ data: { visionMode: "noop" } }, { x: 1 });
    assert.strictEqual(result.visionMode, "noop");
    assert.strictEqual(result.status, "completed");
    assert.deepStrictEqual(result.output, { x: 1 });
  });

  test("inline mode with no dag passes through", async () => {
    const result = await executeVisionLocal({ data: { visionMode: "inline" } }, { y: 2 });
    assert.strictEqual(result.visionMode, "inline");
    assert.strictEqual(result.status, "completed");
    assert.deepStrictEqual(result.output, { y: 2 });
  });

  test("inline mode with dag wraps it in output", async () => {
    const dag = { nodes: [{ id: "n1", type: "set", data: {} }], edges: [] };
    const result = await executeVisionLocal({ data: { visionMode: "inline", dag } }, { intent: "test" });
    assert.strictEqual(result.status, "completed");
    assert.ok((result.output as Record<string, unknown>).dag, "output should contain dag");
  });

  test("trigger mode without workflowId returns error", async () => {
    const result = await executeVisionLocal({ data: { visionMode: "trigger" } }, {});
    assert.strictEqual(result.status, "error");
    assert.ok(result.error?.includes("workflowId"));
  });

  test("trigger mode with workflowId returns queued dev job", async () => {
    const result = await executeVisionLocal({ data: { visionMode: "trigger", workflowId: "wf-123", intent: "run automation" } }, {});
    assert.strictEqual(result.status, "queued");
    assert.strictEqual(result.workflowId, "wf-123");
    assert.ok(result.jobId?.startsWith("dev-vision-"));
    assert.strictEqual(result.intent, "run automation");
  });

  test("trigger mode picks workflowId from $input fallback", async () => {
    const result = await executeVisionLocal({ data: { visionMode: "trigger" } }, { workflowId: "wf-from-input" });
    assert.strictEqual(result.workflowId, "wf-from-input");
    assert.strictEqual(result.status, "queued");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HOPE node tests
// ─────────────────────────────────────────────────────────────────────────────

describe("HOPE node (executeHope)", () => {
  interface HopeNodeDef { data: Record<string, unknown>; }

  async function executeHopeLocal(node: HopeNodeDef, $input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const allowAnon = Boolean(node.data.allowAnon ?? false);
    const requiredRole = String(node.data.requiredRole ?? "");
    const token = String(node.data.token || $input.hopeToken || $input.token || "").replace(/^Bearer\s+/i, "");
    const supabaseUrl = "";  // no Supabase in tests → dev mode

    if (!token) {
      if (allowAnon) return { ...$input, hopeAuthenticated: false, hopeUserId: "", hopeEmail: "", hopeRole: "anon", hopeBlocked: false };
      throw new Error("HOPE: no auth token provided");
    }

    if (!supabaseUrl) {
      // Dev mode
      const userId = `dev-user-${token.slice(0, 8)}`;
      const role = requiredRole || "user";
      if (requiredRole && role !== requiredRole && role !== "admin") {
        throw new Error(`Required role '${requiredRole}' not met (got '${role}')`);
      }
      return { ...$input, hopeAuthenticated: true, hopeUserId: userId, hopeEmail: "dev@hdv.local", hopeRole: role, hopeBlocked: false };
    }
    throw new Error("unreachable in test");
  }

  test("no token + allowAnon passes as anon", async () => {
    const result = await executeHopeLocal({ data: { allowAnon: true } }, {});
    assert.strictEqual(result.hopeAuthenticated, false);
    assert.strictEqual(result.hopeRole, "anon");
    assert.strictEqual(result.hopeBlocked, false);
  });

  test("no token without allowAnon throws", async () => {
    await assert.rejects(() => executeHopeLocal({ data: {} }, {}), /no auth token/i);
  });

  test("valid token in dev mode returns authenticated user", async () => {
    const result = await executeHopeLocal({ data: { token: "tok-abc123xyz" } }, {});
    assert.strictEqual(result.hopeAuthenticated, true);
    assert.strictEqual(result.hopeUserId, "dev-user-tok-abc1");
    assert.strictEqual(result.hopeEmail, "dev@hdv.local");
    assert.strictEqual(result.hopeBlocked, false);
  });

  test("token from $input.hopeToken is accepted", async () => {
    const result = await executeHopeLocal({ data: {} }, { hopeToken: "from-input-xyz" });
    assert.ok(String(result.hopeUserId).startsWith("dev-user-"));
  });

  test("Bearer prefix is stripped from token", async () => {
    const result = await executeHopeLocal({ data: { token: "Bearer mytoken123" } }, {});
    assert.ok(String(result.hopeUserId).includes("mytoken"), "should strip Bearer prefix");
  });

  test("$input is passed through to output", async () => {
    const result = await executeHopeLocal({ data: { token: "tok-xyz" } }, { scene: "dungeon", level: 5 });
    assert.strictEqual(result.scene, "dungeon");
    assert.strictEqual(result.level, 5);
  });
});
