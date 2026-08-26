/**
 * DREAM simulation node — runs a mini-workflow in dry-run mode.
 *
 * DREAM can:
 *   1. Simulate a sequence of node types with synthetic data, returning what
 *      the real execution would produce without side effects.
 *   2. Generate a workflow plan (nodes + edges JSON) from a natural-language
 *      intent using any OpenAI-compatible inference endpoint.
 *   3. Score an existing workflow for completeness, error-handling coverage,
 *      and estimated cost.
 *
 * No real HTTP calls, DB writes, emails, or Slack messages are sent.
 * Side-effectful node types (http, email, slack, database, webhook) are
 * replaced with a safe stub that returns { simulated: true, nodeType }.
 */
import { interpolate as _interpolate } from "../lib/expr";
import { ScenarioBank } from "../hdv/scenario_bank.js";

const scenarioBank = new ScenarioBank();

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const r = _interpolate(template, data as Record<string, unknown>);
  return r !== undefined && r !== null ? String(r) : "";
}

interface OAIResponse {
  choices: Array<{ message: { content: string } }>;
}

const SIDE_EFFECTFUL = new Set([
  "httpRequest", "email", "slack", "database", "webhookTrigger",
  "subWorkflow", "respond", "wait",
]);

const SAFE_PASSTHROUGH = new Set([
  "set", "filter", "ifBranch", "switch", "aggregate", "transform",
  "datetime", "crypto", "splitBatches", "validate", "csv", "htmlExtract",
  "jsonPath", "merge", "deduplicate", "sort", "limit", "renameKeys",
  "code", "noOp", "stickyNote",
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
): { nodeId: string; nodeType: string; simulated: boolean; output: unknown }[] {
  const results: { nodeId: string; nodeType: string; simulated: boolean; output: unknown }[] = [];
  const outputs: Record<string, unknown> = {};
  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};

  for (const n of nodes) {
    children[n.id] = [];
    parents[n.id] = [];
  }
  for (const e of edges) {
    children[e.source]?.push(e.target);
    parents[e.target]?.push(e.source);
  }

  const roots = nodes.filter((n) => (parents[n.id]?.length ?? 0) === 0);
  const queue: SimNode[] = [...roots];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const parentOutputs = (parents[node.id] ?? [])
      .map((pid) => outputs[pid])
      .filter(Boolean);
    const $input = parentOutputs.length > 0
      ? (parentOutputs[parentOutputs.length - 1] as Record<string, unknown>)
      : triggerData;

    const nodeType = String(node.data?.nodeType || node.type || "");
    let output: unknown;
    let simulated = false;

    if (SIDE_EFFECTFUL.has(nodeType)) {
      output = { ...$input, simulated: true, simulatedNodeType: nodeType };
      simulated = true;
    } else if (SAFE_PASSTHROUGH.has(nodeType)) {
      output = { ...$input, _dreamSimulated: true };
      simulated = false;
    } else if (nodeType === "ai" || nodeType === "apex") {
      output = {
        ...$input,
        aiText: `[DREAM simulation — ${nodeType} node would call ${node.data?.model || "the AI model"} here]`,
        aiResult: null,
        aiModel: String(node.data?.model || "simulated"),
        simulated: true,
      };
      simulated = true;
    } else {
      output = { ...$input, _dreamSimulated: true };
    }

    outputs[node.id] = output;
    results.push({ nodeId: node.id, nodeType, simulated, output });

    for (const childId of children[node.id] ?? []) {
      if (!visited.has(childId)) queue.push(nodes.find((n) => n.id === childId)!);
    }
  }

  return results;
}

async function generateWorkflowPlan(
  intent: string,
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ nodes: unknown[]; edges: unknown[]; description: string }> {
  const systemPrompt = `You are DREAM, the HDV workflow architect. Generate a valid n8n-style workflow JSON for the given intent.
Return ONLY a JSON object with this exact structure:
{
  "description": "one-sentence description",
  "nodes": [{ "id": "n1", "type": "nodeType", "data": { "nodeType": "nodeType", "label": "..." } }],
  "edges": [{ "source": "n1", "target": "n2" }]
}
Available node types: webhookTrigger, httpRequest, ai, apex, knoll, code, set, filter, ifBranch, switch, email, slack, database, memoryRead, memoryWrite, aggregate, transform, datetime, validate, respond, stopError, noOp.
Keep it minimal — 3-7 nodes. Each node must have a unique id starting with "n".`;

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: intent },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DREAM plan generation error ${resp.status} — ${errText}`);
  }

  const result = (await resp.json()) as OAIResponse;
  const text = result.choices?.[0]?.message?.content ?? "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch?.[0] ?? text) as { nodes: unknown[]; edges: unknown[]; description: string };
  } catch {
    return { nodes: [], edges: [], description: text.slice(0, 200) };
  }
}

function scoreWorkflow(nodes: SimNode[], edges: SimEdge[]): Record<string, unknown> {
  const nodeTypes = nodes.map((n) => String(n.data?.nodeType || n.type || ""));
  const hasErrorHandling = nodeTypes.some((t) => t === "stopError" || t === "ifBranch");
  const hasOutputNode = nodeTypes.some((t) => t === "respond" || t === "set");
  const sideEffectCount = nodeTypes.filter((t) => SIDE_EFFECTFUL.has(t)).length;
  const hasKnoll = nodeTypes.includes("knoll");
  const hasApex = nodeTypes.includes("apex");

  const score = Math.min(100, [
    hasErrorHandling ? 20 : 0,
    hasOutputNode ? 15 : 0,
    hasKnoll ? 25 : 0,
    hasApex ? 20 : 0,
    nodes.length >= 2 ? 10 : 0,
    edges.length >= 1 ? 10 : 0,
  ].reduce((a, b) => a + b, 0));

  return {
    score,
    grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D",
    hasErrorHandling,
    hasOutputNode,
    hasKnoll,
    hasApex,
    sideEffectCount,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    estimatedCostUsd: 0, // free with local inference
  };
}

export async function executeDream(
  node: NodeDef,
  $input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const mode = String(node.data?.mode || "simulate");

  if (mode === "scenario") {
    // List or specialize from the scenario bank
    const scenarioId = String(node.data?.scenarioId || "");
    if (!scenarioId) {
      return { ...$input, dreamMode: "scenario", dreamScenarios: scenarioBank.list() };
    }
    const context: Record<string, unknown> = (node.data?.scenarioContext ?? {}) as Record<string, unknown>;
    const specialized = scenarioBank.specialize(scenarioId, context);
    return { ...$input, dreamMode: "scenario", dreamScenario: specialized };
  }

  if (mode === "generate") {
    const intent = node.data?.intent ? interpolate(String(node.data.intent), $input) : JSON.stringify($input);
    const baseUrl = String(
      node.data?.baseUrl || process.env.AI_BASE_URL || "http://localhost:11434"
    ).replace(/\/$/, "");
    const apiKey = String(node.data?.apiKey || process.env.AI_API_KEY || "ollama");
    const model = String(node.data?.model || process.env.AI_MODEL || "llama3.2");
    const plan = await generateWorkflowPlan(intent, baseUrl, apiKey, model);
    return { ...$input, dreamMode: "generate", dreamPlan: plan };
  }

  if (mode === "score") {
    const rawNodes = ($input.nodes ?? node.data?.nodes ?? []) as SimNode[];
    const rawEdges = ($input.edges ?? node.data?.edges ?? []) as SimEdge[];
    const scoreResult = scoreWorkflow(rawNodes, rawEdges);
    return { ...$input, dreamMode: "score", dreamScore: scoreResult };
  }

  // Default: simulate
  const rawNodes = ($input.nodes ?? node.data?.nodes ?? []) as SimNode[];
  const rawEdges = ($input.edges ?? node.data?.edges ?? []) as SimEdge[];
  const triggerData = ($input.triggerData ?? {}) as Record<string, unknown>;

  if (rawNodes.length === 0) {
    return { ...$input, dreamMode: "simulate", dreamTrace: [], dreamNote: "No nodes to simulate" };
  }

  const trace = simulateDAG(rawNodes, rawEdges, { ...$input, ...triggerData });
  return {
    ...$input,
    dreamMode: "simulate",
    dreamTrace: trace,
    dreamNodeCount: rawNodes.length,
    dreamEdgeCount: rawEdges.length,
  };
}
