import { BaseAgent, type AgentMessage } from "./base.js";
import type { AgentId } from "../memory_bus.js";

type BudgetTier = "low" | "medium" | "high";

/** MoE heuristic using env-var model names (free / self-hosted). */
function heuristicRoute(intent: string, category: string, budgetTier: BudgetTier): string {
  const defaultModel = process.env.AI_MODEL || "llama3.2";
  const fastModel = process.env.AI_MODEL_FAST || defaultModel;
  const powerModel = process.env.AI_MODEL_POWER || defaultModel;
  const visionModel = process.env.AI_MODEL_VISION || defaultModel;

  const low = budgetTier === "low";
  const high = budgetTier === "high";
  switch (category) {
    case "security": case "audit": return high ? powerModel : defaultModel;
    case "code": case "analysis": return low ? fastModel : high ? powerModel : defaultModel;
    case "creative": case "simulation": return high ? powerModel : defaultModel;
    case "vision": case "multimodal": return visionModel;
    case "chat": case "support": return low ? fastModel : defaultModel;
    default: {
      const lower = intent.toLowerCase();
      if (/secur|audit|knoll/.test(lower)) return powerModel;
      if (/dream|simulat|creat/.test(lower)) return defaultModel;
      if (/cod|debug|refactor/.test(lower)) return defaultModel;
      return low ? fastModel : defaultModel;
    }
  }
}

export class ApexAgent extends BaseAgent {
  readonly id: AgentId = "APEX";

  async process(input: Record<string, unknown>): Promise<AgentMessage> {
    const intent = String(input.intent ?? input.scene ?? "");
    const category = String(input.category ?? "general");
    const budgetTier = (input.budgetTier ?? "medium") as BudgetTier;
    const gpuBurst = input.gpuBurst === true || input.gpuBurst === "true";
    const moeModel = heuristicRoute(intent, category, budgetTier);

    const report = {
      type: "apex_execution_report",
      moeModel,
      moeCategory: category,
      moeBudgetTier: budgetTier,
      // When gpuBurst is set the node executor routes to the cheapest active
      // marketplace GPU listing instead of the local Ollama endpoint.
      gpuBurst,
      routingDecision: gpuBurst ? "marketplace_gpu_burst" : "local_ollama",
      timestamp: Date.now(),
    };

    const record = this.remember(report, ["apex", "execution"]);
    return { id: record.id, from: this.id, content: report, timestamp: record.timestamp };
  }
}
