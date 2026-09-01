import { AgentId, AgentMessage } from "../core/types";
import { BaseAgent } from "./BaseAgent";

export class DreamAgent extends BaseAgent {
  readonly id: AgentId = "DREAM";

  async process(input: Record<string, unknown>): Promise<AgentMessage | null> {
    const world = input.world as Record<string, unknown> | undefined;
    const userAction = input.userAction as Record<string, unknown> | undefined;

    const content = {
      type: "companion_response",
      scene: world?.description ?? "ambient chamber",
      response: this.generateResponse(userAction),
      mood: this.deriveMood(userAction),
      hapticSuggestion: { intensity: 12, pattern: "gentle-pulse", durationMs: 1500 },
    };

    const record = this.remember(content, ["companion", "creation"]);
    return {
      id: record.id,
      from: this.id,
      content,
      timestamp: record.timestamp,
    };
  }

  private generateResponse(action?: Record<string, unknown>): string {
    const text = String(action?.text ?? "");
    if (!text) return "I'm here with you.";
    if (text.toLowerCase().includes("hey")) return "Hey… I noticed you.";
    return `I hear you: "${text}"`;
  }

  private deriveMood(action?: Record<string, unknown>): string {
    const intimacy = Number(action?.intimacy ?? 0);
    if (intimacy > 0.7) return "warm";
    if (intimacy > 0.3) return "attentive";
    return "calm";
  }
}
