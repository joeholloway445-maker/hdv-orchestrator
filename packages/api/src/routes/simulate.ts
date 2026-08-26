/**
 * POST /simulate — DREAM simulation endpoint.
 *
 * Accepts a workflow definition (nodes + edges + optional triggerData) and
 * runs it through DREAM's dry-run DAG, returning the simulated trace without
 * any real side effects. Also supports:
 *   - POST /simulate/generate  — generate a workflow plan from intent text
 *   - POST /simulate/score     — score an existing workflow definition
 */
import { Router } from "express";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

/** Shallow simulation of a DAG without touching the worker. */
const SIDE_EFFECTFUL = new Set([
  "httpRequest", "email", "slack", "database", "webhookTrigger",
  "subWorkflow", "respond", "wait",
]);

interface SimNode {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

interface SimEdge {
  source: string;
  target: string;
}

function simulateDAG(
  nodes: SimNode[],
  edges: SimEdge[],
  triggerData: Record<string, unknown>,
): { nodeId: string; nodeType: string; simulated: boolean; output: Record<string, unknown> }[] {
  const results: { nodeId: string; nodeType: string; simulated: boolean; output: Record<string, unknown> }[] = [];
  const outputs: Record<string, unknown> = {};
  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};

  for (const n of nodes) { children[n.id] = []; parents[n.id] = []; }
  for (const e of edges) {
    children[e.source]?.push(e.target);
    parents[e.target]?.push(e.source);
  }

  const queue: SimNode[] = nodes.filter((n) => (parents[n.id]?.length ?? 0) === 0);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const parentOuts = (parents[node.id] ?? []).map((pid) => outputs[pid]).filter(Boolean);
    const $input = parentOuts.length > 0
      ? (parentOuts[parentOuts.length - 1] as Record<string, unknown>)
      : triggerData;

    const nodeType = String(node.data?.nodeType || node.type || "");
    let simulated = false;
    let output: Record<string, unknown>;

    if (SIDE_EFFECTFUL.has(nodeType)) {
      output = { ...$input, simulated: true, simulatedNodeType: nodeType };
      simulated = true;
    } else if (nodeType === "ai" || nodeType === "apex") {
      output = {
        ...$input,
        aiText: `[DREAM simulation — ${nodeType} call skipped]`,
        aiModel: String(node.data?.model ?? "simulated"),
        simulated: true,
      };
      simulated = true;
    } else if (nodeType === "knoll") {
      output = { ...$input, _knollAudit: { passed: true, simulated: true } };
    } else {
      output = { ...$input };
    }

    outputs[node.id] = output;
    results.push({ nodeId: node.id, nodeType, simulated, output });
    for (const cid of children[node.id] ?? []) {
      if (!visited.has(cid)) {
        const child = nodes.find((n) => n.id === cid);
        if (child) queue.push(child);
      }
    }
  }

  return results;
}

function scoreWorkflow(nodes: SimNode[], edges: SimEdge[]) {
  const nodeTypes = nodes.map((n) => String(n.data?.nodeType || n.type || ""));
  const hasErrorHandling = nodeTypes.some((t) => t === "stopError" || t === "ifBranch");
  const hasOutputNode = nodeTypes.some((t) => t === "respond" || t === "set");
  const sideEffectCount = nodeTypes.filter((t) => SIDE_EFFECTFUL.has(t)).length;
  const hasKnoll = nodeTypes.includes("knoll");
  const hasApex = nodeTypes.includes("apex");

  const score = [
    hasErrorHandling ? 20 : 0,
    hasOutputNode ? 15 : 0,
    hasKnoll ? 25 : 0,
    hasApex ? 20 : 0,
    nodes.length >= 2 ? 10 : 0,
    edges.length >= 1 ? 10 : 0,
  ].reduce((a, b) => a + b, 0);

  return {
    score: Math.min(score, 100),
    grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D",
    hasErrorHandling, hasOutputNode, hasKnoll, hasApex,
    sideEffectCount,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    estimatedCostUsd: (
      sideEffectCount * 0.001 +
      nodeTypes.filter((t) => t === "ai" || t === "apex").length * 0.01
    ).toFixed(4),
    recommendations: [
      !hasKnoll ? "Add a KNOLL audit node before side-effectful nodes for security validation." : null,
      !hasApex ? "Use an APEX dispatch node for AI tasks to enable Mixture-of-Experts routing." : null,
      !hasErrorHandling ? "Add error handling (ifBranch or stopError) for production resilience." : null,
    ].filter(Boolean),
  };
}

// POST /simulate — simulate a workflow dry-run
router.post("/", async (req: AuthRequest, res) => {
  try {
    const { nodes = [], edges = [], triggerData = {} } = req.body as {
      nodes?: SimNode[];
      edges?: SimEdge[];
      triggerData?: Record<string, unknown>;
    };

    if (!Array.isArray(nodes)) {
      return res.status(400).json({ error: "nodes must be an array" });
    }

    const trace = simulateDAG(nodes, edges, triggerData);
    const score = scoreWorkflow(nodes, edges);

    return res.json({
      mode: "simulate",
      trace,
      score,
      summary: {
        totalNodes: nodes.length,
        simulatedNodes: trace.filter((t) => t.simulated).length,
        realNodes: trace.filter((t) => !t.simulated).length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /simulate/score — score an existing workflow
router.post("/score", async (req: AuthRequest, res) => {
  try {
    const { nodes = [], edges = [] } = req.body as { nodes?: SimNode[]; edges?: SimEdge[] };
    if (!Array.isArray(nodes)) return res.status(400).json({ error: "nodes must be an array" });
    return res.json(scoreWorkflow(nodes, edges));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// POST /simulate/generate — generate workflow plan via DREAM/APEX
router.post("/generate", async (req: AuthRequest, res) => {
  try {
    const { intent } = req.body as { intent?: string };
    if (!intent || typeof intent !== "string" || intent.trim().length === 0) {
      return res.status(400).json({ error: "intent is required" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "AI generation unavailable — ANTHROPIC_API_KEY not configured" });
    }

    const systemPrompt = `You are DREAM, the HDV workflow architect. Generate a valid workflow JSON for the given intent.
Return ONLY a JSON object:
{
  "description": "one-sentence description",
  "nodes": [{ "id": "n1", "type": "nodeType", "data": { "nodeType": "nodeType", "label": "..." } }],
  "edges": [{ "source": "n1", "target": "n2" }]
}
Available node types: webhookTrigger, httpRequest, ai, apex, knoll, code, set, filter, ifBranch, switch, email, slack, database, memoryRead, memoryWrite, aggregate, transform, datetime, validate, respond, stopError, noOp.
Always include a knoll node before any httpRequest, email, slack, or database node for security.
Keep it 3-8 nodes. Each node must have a unique id starting with "n".`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: intent.trim() }],
      }),
    });

    if (!resp.ok) {
      return res.status(502).json({ error: `DREAM generation failed: HTTP ${resp.status}` });
    }

    const data = (await resp.json()) as { content: Array<{ type: string; text: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "{}";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const plan = JSON.parse(jsonMatch?.[0] ?? text) as { nodes: SimNode[]; edges: SimEdge[]; description: string };
      const score = scoreWorkflow(plan.nodes ?? [], plan.edges ?? []);
      return res.json({ mode: "generate", plan, score });
    } catch {
      return res.json({ mode: "generate", plan: { description: text, nodes: [], edges: [] } });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export { router as simulateRouter };
