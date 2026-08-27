import { BaseAgent, type AgentMessage } from "./base.js";
import type { AgentId } from "../memory_bus.js";

export class VisionAgent extends BaseAgent {
  readonly id: AgentId = "VISION";

  async process(_input: Record<string, unknown>): Promise<AgentMessage> {
    const recentDream = this.bus.read("VISION", 4).filter((r) => r.from === "DREAM");
    const latestDream = recentDream[recentDream.length - 1];

    const dreamContent = latestDream?.content as Record<string, unknown> | undefined;
    const content = {
      type: "operational_synthesis",
      dreamRef: latestDream?.id ?? null,
      intent: this.synthesizeIntent(dreamContent),
      hapticRecommendation: dreamContent?.hapticSuggestion ?? null,
      worldAdjustment: { lightingShift: -0.1, soundscape: "ambient-calm" },
    };

    const record = this.remember(content, ["synthesis", "execution-ready"]);
    return { id: record.id, from: this.id, content, timestamp: record.timestamp };
  }

  private synthesizeIntent(dreamContent?: Record<string, unknown>): string {
    if (!dreamContent) return "Standby — no DREAM context yet.";
    const mood = String(dreamContent.mood ?? "neutral");
    return `Deliver ${mood} interaction pipeline; apply haptic layer per DREAM suggestion.`;
  }
}
