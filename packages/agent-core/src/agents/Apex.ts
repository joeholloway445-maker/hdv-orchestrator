import { AgentId, AgentMessage, HapticCommand } from "../core/types";
import { BaseAgent } from "./BaseAgent";

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

export class ApexAgent extends BaseAgent {
  readonly id: AgentId = "APEX";

  async process(input: Record<string, unknown>): Promise<AgentMessage | null> {
    const hapticCmd = input.haptic as HapticCommand | undefined;

    // MoE routing: select optimal model for any LLM call in this cycle
    const intent = String(input.intent ?? input.scene ?? "");
    const category = String(input.category ?? "general");
    const budgetTier = (input.budgetTier ?? "medium") as BudgetTier;
    const moeModel = heuristicRoute(intent, category, budgetTier);

    const report = {
      type: "apex_execution_report",
      hapticDispatched: hapticCmd ? this.dispatchHaptic(hapticCmd) : null,
      moeModel,
      moeCategory: category,
      moeBudgetTier: budgetTier,
      timestamp: Date.now(),
    };

    const record = this.remember(report, ["apex", "execution"]);
    return {
      id: record.id,
      from: this.id,
      content: report,
      timestamp: record.timestamp,
    };
  }

  private dispatchHaptic(cmd: HapticCommand): Record<string, unknown> {
    console.log(`[APEX] Haptic dispatch → pattern=${cmd.pattern} intensity=${cmd.intensity} duration=${cmd.durationMs}ms`);
    return { dispatched: true, pattern: cmd.pattern, intensity: cmd.intensity, durationMs: cmd.durationMs };
  }
}
