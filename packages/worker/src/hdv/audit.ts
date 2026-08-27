/**
 * KNOLL in-memory security audit log.
 * Ported from HDV_Foundation/knoll/audit.ts — persistence dep removed for worker context.
 */
import { randomUUID } from "node:crypto";

export interface SecurityAuditEntry {
  id: string;
  packetId: string;
  outcome: "ALLOWED" | "BLOCKED";
  reasoning?: string;
  timestamp: number;
}

export class SecurityAuditLog {
  private readonly entries: SecurityAuditEntry[] = [];

  record(packetId: string, outcome: "ALLOWED" | "BLOCKED", reasoning?: string): SecurityAuditEntry {
    const entry: SecurityAuditEntry = {
      id: randomUUID(),
      packetId,
      outcome,
      reasoning,
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly SecurityAuditEntry[] { return this.entries; }
  blocked(): readonly SecurityAuditEntry[] { return this.entries.filter((e) => e.outcome === "BLOCKED"); }
  count(): number { return this.entries.length; }
  blockedCount(): number { return this.blocked().length; }
  clear(): void { this.entries.length = 0; }
}

export const globalAuditLog = new SecurityAuditLog();
