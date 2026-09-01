import { v4 as uuidv4 } from "uuid";
import { AgentId, MemoryRecord } from "../core/types";
import * as fs from "fs";
import * as path from "path";

/**
 * Strict one-way memory bus.
 * Only upward flow is allowed: DREAM → VISION → HOPE
 * KNOLL can read everything but never writes to other agents.
 * APEX is treated as a side-channel execution layer.
 */
export class MemoryBus {
  private records: MemoryRecord[] = [];
  private persistPath: string;

  // Allowed upward edges only
  private static readonly ALLOWED: Record<string, AgentId[]> = {
    DREAM: ["VISION"],
    VISION: ["HOPE"],
    HOPE: [],          // top of hierarchy
    KNOLL: [],         // silent, no outbound
    APEX: ["HOPE"],    // can report upward only
  };

  constructor(persistPath = "./data/memory") {
    this.persistPath = persistPath;
    if (!fs.existsSync(persistPath)) {
      fs.mkdirSync(persistPath, { recursive: true });
    }
    this.load();
  }

  /**
   * Push memory upward only. Throws if the direction is illegal.
   */
  push(from: AgentId, content: any, tags: string[] = []): MemoryRecord {
    const allowed = MemoryBus.ALLOWED[from] || [];
    if (allowed.length === 0 && from !== "HOPE") {
      throw new Error(`[MemoryBus] Illegal downward or lateral write attempt from ${from}`);
    }

    const record: MemoryRecord = {
      id: uuidv4(),
      from,
      to: allowed[0] || "UPWARD",
      timestamp: Date.now(),
      content,
      tags,
    };

    this.records.push(record);
    this.persist(record);
    return record;
  }

  /**
   * KNOLL and HOPE can read everything.
   * VISION can read DREAM + own.
   * DREAM can only read its own recent.
   */
  read(reader: AgentId, limit = 50): MemoryRecord[] {
    if (reader === "KNOLL" || reader === "HOPE") {
      return this.records.slice(-limit);
    }
    if (reader === "VISION") {
      return this.records
        .filter((r) => r.from === "DREAM" || r.from === "VISION")
        .slice(-limit);
    }
    return this.records.filter((r) => r.from === reader).slice(-limit);
  }

  private persist(record: MemoryRecord) {
    const file = path.join(this.persistPath, `${record.id}.json`);
    fs.writeFileSync(file, JSON.stringify(record, null, 2));
  }

  private load() {
    if (!fs.existsSync(this.persistPath)) return;
    const files = fs.readdirSync(this.persistPath).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.persistPath, f), "utf8"));
        this.records.push(data);
      } catch {}
    }
    this.records.sort((a, b) => a.timestamp - b.timestamp);
  }
}
