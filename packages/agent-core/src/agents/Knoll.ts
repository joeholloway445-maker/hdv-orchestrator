import { AgentId, AgentMessage, MemoryRecord } from "../core/types";
import { BaseAgent } from "./BaseAgent";

const VIOLATION_THRESHOLD = 0.34;

export class KnollAgent extends BaseAgent {
  readonly id: AgentId = "KNOLL";

  async process(_input: Record<string, unknown>): Promise<AgentMessage | null> {
    const allRecords = this.bus.read("KNOLL", 50);
    const violations = this.audit(allRecords);

    if (violations.length > 0) {
      const score = violations.length / Math.max(allRecords.length, 1);
      if (score >= VIOLATION_THRESHOLD) {
        console.error(`[KNOLL] SYSTEM FREEZE — violation score ${(score * 100).toFixed(1)}%`);
        console.error("[KNOLL] Violations:", violations);
        // In production this would trigger SystemFreezeController
      } else {
        console.warn(`[KNOLL] Audit warnings (${violations.length}):`, violations);
      }
    } else {
      console.log("[KNOLL] Audit clean — hierarchy integrity confirmed.");
    }

    // KNOLL never writes to any agent
    return null;
  }

  private audit(records: MemoryRecord[]): string[] {
    const violations: string[] = [];
    const allowed: Record<string, string[]> = {
      DREAM: ["VISION"],
      VISION: ["HOPE"],
      HOPE: [],
      KNOLL: [],
      APEX: ["HOPE"],
    };

    for (const r of records) {
      const permittedTargets = allowed[r.from] ?? [];
      if (r.to !== "UPWARD" && !permittedTargets.includes(r.to)) {
        violations.push(`Illegal routing ${r.from}→${r.to} (record ${r.id})`);
      }
    }
    return violations;
  }
}
