/**
 * HDV strict one-way memory bus.
 * Ported from hdv-agent-core — only upward flow allowed: DREAM → VISION → HOPE.
 * KNOLL reads everything, never writes. APEX reports upward only.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type AgentId = "HOPE" | "VISION" | "DREAM" | "KNOLL" | "APEX";

export interface MemoryRecord {
  id: string;
  from: AgentId;
  to: AgentId | "UPWARD";
  timestamp: number;
  content: unknown;
  tags?: string[];
  /** Optional tenant scope — set for multi-tenant worker deployments. */
  tenantId?: string;
}

const ALLOWED: Record<AgentId, AgentId[]> = {
  DREAM: ["VISION"],
  VISION: ["HOPE"],
  HOPE: [],
  KNOLL: [],
  APEX: ["HOPE"],
};

export class MemoryBus {
  private records: MemoryRecord[] = [];
  private readonly persistPath: string;

  constructor(persistPath = "./data/memory") {
    this.persistPath = persistPath;
    if (!fs.existsSync(persistPath)) {
      fs.mkdirSync(persistPath, { recursive: true });
    }
    this.load();
  }

  /** Push memory upward only. Throws if the direction is illegal. */
  push(from: AgentId, content: unknown, tags: string[] = []): MemoryRecord {
    const allowed = ALLOWED[from];
    if (allowed.length === 0 && from !== "HOPE") {
      throw new Error(`[MemoryBus] Illegal downward or lateral write attempt from ${from}`);
    }
    const record: MemoryRecord = {
      id: randomUUID(),
      from,
      to: (allowed[0] as AgentId) || "UPWARD" as const,
      timestamp: Date.now(),
      content,
      tags,
    };
    this.records.push(record);
    this.persist(record);
    return record;
  }

  /** Read-visibility follows the one-way hierarchy. */
  read(reader: AgentId, limit = 50): MemoryRecord[] {
    if (reader === "KNOLL" || reader === "HOPE") return this.records.slice(-limit);
    if (reader === "VISION") return this.records.filter((r) => r.from === "DREAM" || r.from === "VISION").slice(-limit);
    return this.records.filter((r) => r.from === reader).slice(-limit);
  }

  /**
   * Return a filtered view of this bus containing only records belonging to the
   * given tenantId. Records with no tenantId are considered to belong to any tenant
   * (legacy / pre-tenancy records).
   */
  forTenant(tenantId: string): MemoryRecord[] {
    return this.records.filter((r) => !r.tenantId || r.tenantId === tenantId);
  }

  private persist(record: MemoryRecord) {
    try {
      fs.writeFileSync(path.join(this.persistPath, `${record.id}.json`), JSON.stringify(record));
    } catch {}
  }

  private load() {
    if (!fs.existsSync(this.persistPath)) return;
    try {
      const files = fs.readdirSync(this.persistPath).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.persistPath, f), "utf8")) as MemoryRecord;
          this.records.push(data);
        } catch {}
      }
      this.records.sort((a, b) => a.timestamp - b.timestamp);
    } catch {}
  }
}

/** Global singleton for the worker process. */
export const globalMemoryBus = new MemoryBus(process.env.MEMORY_PERSIST_PATH || "./data/memory");
