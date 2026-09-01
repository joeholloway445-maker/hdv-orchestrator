import { AgentId, AgentMessage } from "../core/types";
import { BaseAgent } from "./BaseAgent";

export class HopeAgent extends BaseAgent {
  readonly id: AgentId = "HOPE";

  async process(_input: Record<string, unknown>): Promise<AgentMessage | null> {
    const allMemory = this.bus.read("HOPE", 20);
    const visionReports = allMemory.filter((r) => r.from === "VISION");
    const latest = visionReports[visionReports.length - 1];

    const directive = this.issueDirective(latest?.content);

    // HOPE is the apex — it does not push further upward; just logs the directive.
    console.log("[HOPE] Governance directive:", directive);

    return {
      id: `hope-${Date.now()}`,
      from: this.id,
      content: { type: "governance_directive", directive },
      timestamp: Date.now(),
    };
  }

  private issueDirective(visionContent?: Record<string, unknown>): string {
    if (!visionContent) {
      return "STANDBY: Await DREAM→VISION cycle before issuing policy.";
    }
    const intent = String(visionContent.intent ?? "");
    return `APPROVED: ${intent} — maintain companion ethical layer. No escalation.`;
  }
}
