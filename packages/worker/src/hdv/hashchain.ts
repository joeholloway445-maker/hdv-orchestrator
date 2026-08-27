/**
 * Tamper-evident hash-chain over the KNOLL SecurityAudit log.
 * Ported from HDV_Foundation/knoll/hashchain.ts — standalone, node:crypto only.
 */
import { createHash } from "node:crypto";
import type { SecurityAuditEntry } from "./audit.js";

export interface HashChainLink {
  index: number;
  entry: SecurityAuditEntry;
  entryHash: string;
  prevHash: string;
  hash: string;
}

export interface HashChainVerification {
  valid: boolean;
  length: number;
  brokenAt: number;
  reason?: string;
}

export const GENESIS_HASH = "0".repeat(64);

function canonicalizeEntry(entry: SecurityAuditEntry): string {
  return JSON.stringify({
    id: entry.id,
    packetId: entry.packetId,
    outcome: entry.outcome,
    reasoning: entry.reasoning ?? null,
    timestamp: entry.timestamp,
  });
}

export function hashAuditEntry(entry: SecurityAuditEntry): string {
  return createHash("sha256").update(canonicalizeEntry(entry)).digest("hex");
}

export function computeLinkHash(index: number, prevHash: string, entryHash: string): string {
  return createHash("sha256").update(`${index}|${prevHash}|${entryHash}`).digest("hex");
}

export class AuditHashChain {
  private readonly links: HashChainLink[] = [];

  append(entry: SecurityAuditEntry): HashChainLink {
    const index = this.links.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.links[index - 1].hash;
    const entryHash = hashAuditEntry(entry);
    const hash = computeLinkHash(index, prevHash, entryHash);
    const link: HashChainLink = { index, entry, entryHash, prevHash, hash };
    this.links.push(link);
    return link;
  }

  appendAll(entries: Iterable<SecurityAuditEntry>): string {
    for (const e of entries) this.append(e);
    return this.head();
  }

  rebuild(entries: Iterable<SecurityAuditEntry>): string {
    this.links.length = 0;
    return this.appendAll(entries);
  }

  head(): string {
    return this.links.length === 0 ? GENESIS_HASH : this.links[this.links.length - 1].hash;
  }

  get length(): number { return this.links.length; }

  chain(): readonly HashChainLink[] { return this.links; }

  verify(): HashChainVerification {
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      if (link.index !== i) return { valid: false, length: this.links.length, brokenAt: i, reason: `index ${link.index} != position ${i}` };
      if (link.prevHash !== prevHash) return { valid: false, length: this.links.length, brokenAt: i, reason: `prevHash mismatch at ${i}` };
      if (hashAuditEntry(link.entry) !== link.entryHash) return { valid: false, length: this.links.length, brokenAt: i, reason: `entry altered at ${i}` };
      if (computeLinkHash(i, link.prevHash, link.entryHash) !== link.hash) return { valid: false, length: this.links.length, brokenAt: i, reason: `link hash invalid at ${i}` };
      prevHash = link.hash;
    }
    return { valid: true, length: this.links.length, brokenAt: -1 };
  }

  detectTamper(currentEntries: readonly SecurityAuditEntry[]): HashChainVerification {
    if (currentEntries.length !== this.links.length) {
      return { valid: false, length: this.links.length, brokenAt: Math.min(currentEntries.length, this.links.length), reason: `length changed: sealed ${this.links.length}, now ${currentEntries.length}` };
    }
    let prevHash = GENESIS_HASH;
    for (let i = 0; i < currentEntries.length; i++) {
      const entryHash = hashAuditEntry(currentEntries[i]);
      const hash = computeLinkHash(i, prevHash, entryHash);
      if (hash !== this.links[i].hash) {
        return { valid: false, length: this.links.length, brokenAt: i, reason: `entry at ${i} does not match sealed chain` };
      }
      prevHash = hash;
    }
    return { valid: true, length: this.links.length, brokenAt: -1 };
  }
}

export const globalAuditChain = new AuditHashChain();
