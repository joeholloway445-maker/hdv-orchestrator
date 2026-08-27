/**
 * Tamper-evident SHA-256 audit chain for KNOLL node verdicts.
 * Each entry's hash commits to (prevHash ‖ timestamp ‖ nodeId ‖ verdict),
 * forming an append-only chain that can be verified end-to-end.
 */
import { createHash } from "node:crypto";

export interface AuditEntry {
  timestamp: string;
  tenantId?: string;
  nodeId: string;
  verdict: string;
  hash: string;
  prevHash: string;
}

export class AuditHashChain {
  private entries: AuditEntry[] = [];
  private lastHash = "0".repeat(64);

  /** Append a new verdict entry and return it. */
  append(nodeId: string, verdict: string, tenantId?: string): AuditEntry {
    const timestamp = new Date().toISOString();
    const prevHash = this.lastHash;
    const hash = createHash("sha256")
      .update(prevHash + timestamp + nodeId + verdict)
      .digest("hex");
    const entry: AuditEntry = { timestamp, tenantId, nodeId, verdict, hash, prevHash };
    this.entries.push(entry);
    this.lastHash = hash;
    return entry;
  }

  /**
   * Re-derive every entry's hash from scratch and confirm the chain is intact.
   * Returns false on the first inconsistency found.
   */
  verify(): boolean {
    let prevHash = "0".repeat(64);
    for (const entry of this.entries) {
      if (entry.prevHash !== prevHash) return false;
      const expected = createHash("sha256")
        .update(prevHash + entry.timestamp + entry.nodeId + entry.verdict)
        .digest("hex");
      if (expected !== entry.hash) return false;
      prevHash = entry.hash;
    }
    return true;
  }

  /** Return a shallow copy of all entries. */
  toJSON(): AuditEntry[] {
    return [...this.entries];
  }
}

/** Process-level singleton used by the KNOLL node executor. */
export const globalChain = new AuditHashChain();
