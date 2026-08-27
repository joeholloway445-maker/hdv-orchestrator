/**
 * HDV strict one-way memory bus.
 * Ported from hdv-agent-core — only upward flow allowed: DREAM → VISION → HOPE.
 * KNOLL reads everything, never writes. APEX reports upward only.
 */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import Redis from "ioredis";

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

/** 30 days in seconds — TTL applied to each Redis list key. */
const REDIS_TTL = 30 * 24 * 60 * 60;

export class MemoryBus {
  private records: MemoryRecord[] = [];
  private readonly persistPath: string;
  private redis: Redis | null = null;

  constructor(persistPath = "./data/memory") {
    this.persistPath = persistPath;
    if (!fs.existsSync(persistPath)) {
      fs.mkdirSync(persistPath, { recursive: true });
    }
    this.load();
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { enableOfflineQueue: false });
    }
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
    // Fire-and-forget Redis persistence — never throws.
    this._saveToRedis(record).catch(() => {});
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

  /**
   * Persist a single record to Redis. Uses `RPUSH` into a per-tenant list key
   * and refreshes the 30-day TTL. No-ops when Redis is not configured.
   */
  async _saveToRedis(record: MemoryRecord): Promise<void> {
    if (!this.redis) return;
    const key = `hdv:memory:${record.tenantId || "global"}`;
    try {
      await this.redis.rpush(key, JSON.stringify(record));
      await this.redis.expire(key, REDIS_TTL);
    } catch {
      // Redis unavailable — silently skip; file-based persistence already ran.
    }
  }

  /**
   * Hydrate the in-memory array from all `hdv:memory:*` keys in Redis.
   * Deduplicates against records already loaded from disk. No-ops when Redis
   * is not configured.
   */
  async _loadFromRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      // Collect all hdv:memory:* keys via SCAN (cursor-based, safe on large keyspaces).
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [nextCursor, found] = await this.redis.scan(cursor, "MATCH", "hdv:memory:*", "COUNT", "100");
        cursor = nextCursor;
        keys.push(...found);
      } while (cursor !== "0");

      // Load all serialised records from each list key.
      const redisRecords: MemoryRecord[] = [];
      for (const key of keys) {
        const items = await this.redis.lrange(key, 0, -1);
        for (const item of items) {
          try {
            redisRecords.push(JSON.parse(item) as MemoryRecord);
          } catch {
            // Malformed entry — skip.
          }
        }
      }

      // Merge without duplicating records already loaded from disk.
      const existingIds = new Set(this.records.map((r) => r.id));
      for (const r of redisRecords) {
        if (!existingIds.has(r.id)) {
          this.records.push(r);
        }
      }
      this.records.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      // Redis unavailable — in-memory state is still valid from disk load.
    }
  }

  /**
   * Async factory: creates a MemoryBus and awaits the Redis hydration step
   * before returning. Prefer this over the constructor in server startup paths
   * where you want a fully warm bus.
   */
  static async create(persistPath = process.env.MEMORY_PERSIST_PATH || "./data/memory"): Promise<MemoryBus> {
    const bus = new MemoryBus(persistPath);
    await bus._loadFromRedis();
    return bus;
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

// Non-blocking async init: hydrate from Redis if REDIS_URL is configured.
globalMemoryBus._loadFromRedis().catch(() => {});
