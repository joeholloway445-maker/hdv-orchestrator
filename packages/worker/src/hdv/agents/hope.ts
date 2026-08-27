import { BaseAgent, type AgentMessage } from "./base.js";
import type { AgentId } from "../memory_bus.js";

export class HopeAgent extends BaseAgent {
  readonly id: AgentId = "HOPE";

  async process(_input: Record<string, unknown>): Promise<AgentMessage> {
    const allMemory = this.bus.read("HOPE", 20);
    const visionReports = allMemory.filter((r) => r.from === "VISION");
    const latest = visionReports[visionReports.length - 1];

    const directive = this.issueDirective(latest?.content as Record<string, unknown> | undefined);
    console.log("[HOPE] Governance directive:", directive);

    return {
      id: `hope-${Date.now()}`,
      from: this.id,
      content: { type: "governance_directive", directive },
      timestamp: Date.now(),
    };
  }

  private issueDirective(visionContent?: Record<string, unknown>): string {
    if (!visionContent) return "STANDBY: Await DREAM→VISION cycle before issuing policy.";
    const intent = String(visionContent.intent ?? "");
    return `APPROVED: ${intent} — maintain companion ethical layer. No escalation.`;
  }
}
