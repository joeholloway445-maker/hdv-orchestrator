/**
 * workflow.ts — HOPE Studio → HDV workflow integration.
 *
 * Converts studio scenarios into HDV n8n-style workflow definitions
 * and submits them to hdv-orchestrator for DREAM simulation or VISION execution.
 * APEX MoE routing selects the optimal model for each scenario step.
 */

import type { Scenario, Persona } from "./types";

// ── MoE heuristic (mirrors HDV-Foundation apex_router) ─────────────────────

type BudgetTier = "low" | "medium" | "high";

const MODEL_MAP = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
  fable: "claude-fable-5",
} as const;

export function heuristicRoute(
  intent: string,
  category: string,
  budgetTier: BudgetTier,
): string {
  const low = budgetTier === "low";
  const high = budgetTier === "high";
  switch (category) {
    case "security": case "audit":
      return high ? MODEL_MAP.opus : MODEL_MAP.sonnet;
    case "code": case "analysis":
      return low ? MODEL_MAP.haiku : high ? MODEL_MAP.opus : MODEL_MAP.sonnet;
    case "creative": case "simulation":
      return high ? MODEL_MAP.fable : MODEL_MAP.sonnet;
    case "vision": case "multimodal":
      return MODEL_MAP.sonnet;
    case "chat": case "support":
      return low ? MODEL_MAP.haiku : MODEL_MAP.sonnet;
    default: {
      const lower = intent.toLowerCase();
      if (/secur|audit|knoll/.test(lower)) return MODEL_MAP.opus;
      if (/dream|simulat|creat/.test(lower)) return MODEL_MAP.fable;
      if (/cod|debug|refactor/.test(lower)) return MODEL_MAP.sonnet;
      return low ? MODEL_MAP.haiku : MODEL_MAP.sonnet;
    }
  }
}

// ── Scenario → workflow DAG conversion ─────────────────────────────────────

export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  source: string;
  target: string;
}

export interface ScenarioWorkflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    scenarioId: string;
    personaId: string;
    moeModel: string;
    moeCategory: string;
  };
}

/**
 * Convert a studio Scenario into an HDV workflow DAG.
 * Each scene becomes a workflow node; choices become edges.
 * A KNOLL audit node is prepended; an APEX dispatch node closes each branch.
 */
export function scenarioToWorkflow(
  scenario: Scenario,
  persona: Persona,
  budgetTier: BudgetTier = "high",
): ScenarioWorkflow {
  const intent = `${persona.personality} — ${scenario.title}`;
  const moeModel = heuristicRoute(intent, "simulation", budgetTier);

  const nodes: WorkflowNode[] = [
    // KNOLL security audit runs first
    {
      id: "knoll-0",
      type: "knoll",
      data: {
        nodeType: "knoll",
        label: "KNOLL audit",
        checkForbiddenKeys: true,
        checkSsrf: true,
      },
    },
    // APEX MoE dispatch
    {
      id: "apex-0",
      type: "apex",
      data: {
        nodeType: "apex",
        label: "APEX MoE router",
        intent,
        category: "simulation",
        budgetTier,
        moeModel,
      },
    },
  ];

  const edges: WorkflowEdge[] = [{ source: "knoll-0", target: "apex-0" }];

  // One node per scene
  let prevId = "apex-0";
  for (const scene of scenario.scenes) {
    const nodeId = `scene-${scene.id}`;
    nodes.push({
      id: nodeId,
      type: "ai",
      data: {
        nodeType: "ai",
        label: scene.name,
        sceneId: scene.id,
        lines: scene.lines,
        personaId: persona.id,
        personaName: persona.name,
        moeModel,
      },
    });
    edges.push({ source: prevId, target: nodeId });

    // Branch edges from choices
    for (const choice of scene.choices) {
      if (choice.nextSceneId) {
        edges.push({ source: nodeId, target: `scene-${choice.nextSceneId}` });
      }
    }

    if (scene.terminal) {
      nodes.push({
        id: `respond-${scene.id}`,
        type: "respond",
        data: { nodeType: "respond", label: `End: ${scene.name}` },
      });
      edges.push({ source: nodeId, target: `respond-${scene.id}` });
    } else if (scene.choices.length === 0) {
      prevId = nodeId;
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      scenarioId: scenario.id,
      personaId: persona.id,
      moeModel,
      moeCategory: "simulation",
    },
  };
}

// ── Orchestrator bridge ─────────────────────────────────────────────────────

export interface WorkflowSubmitResult {
  status: "triggered" | "simulated" | "error";
  moeModel: string;
  jobId?: string;
  simulate?: unknown;
  error?: string;
}

const ORCHESTRATOR_URL = (
  process.env.WORKFLOW_API_URL ?? ""
).replace(/\/$/, "");
const ORCHESTRATOR_KEY = process.env.WORKFLOW_API_KEY ?? "";

/** Simulate a scenario workflow through DREAM before executing. */
export async function simulateScenario(
  scenario: Scenario,
  persona: Persona,
  budgetTier: BudgetTier = "high",
): Promise<WorkflowSubmitResult> {
  const workflow = scenarioToWorkflow(scenario, persona, budgetTier);

  if (!ORCHESTRATOR_URL || !ORCHESTRATOR_KEY) {
    return {
      status: "error",
      moeModel: workflow.metadata.moeModel,
      error: "WORKFLOW_API_URL or WORKFLOW_API_KEY not configured",
    };
  }

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ORCHESTRATOR_KEY}`,
      },
      body: JSON.stringify({ workflow, triggerData: { scenarioId: scenario.id } }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: "simulated", moeModel: workflow.metadata.moeModel, simulate: data };
  } catch (err) {
    return {
      status: "error",
      moeModel: workflow.metadata.moeModel,
      error: err instanceof Error ? err.message : "Simulation failed",
    };
  }
}

/** Trigger VISION execution of a scenario workflow. */
export async function triggerScenario(
  workflowId: string,
  scenario: Scenario,
  persona: Persona,
  budgetTier: BudgetTier = "high",
  userId?: string,
): Promise<WorkflowSubmitResult> {
  const workflow = scenarioToWorkflow(scenario, persona, budgetTier);

  if (!ORCHESTRATOR_URL || !ORCHESTRATOR_KEY) {
    return {
      status: "error",
      moeModel: workflow.metadata.moeModel,
      error: "WORKFLOW_API_URL or WORKFLOW_API_KEY not configured",
    };
  }

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/workflows/${workflowId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ORCHESTRATOR_KEY}`,
        ...(userId ? { "x-hdv-user-id": userId } : {}),
      },
      body: JSON.stringify({
        triggerData: {
          scenarioId: scenario.id,
          personaId: persona.id,
          moeModel: workflow.metadata.moeModel,
          moeCategory: "simulation",
          moeBudgetTier: budgetTier,
        },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { jobId?: string };
    return { status: "triggered", moeModel: workflow.metadata.moeModel, jobId: data.jobId };
  } catch (err) {
    return {
      status: "error",
      moeModel: workflow.metadata.moeModel,
      error: err instanceof Error ? err.message : "Trigger failed",
    };
  }
}
