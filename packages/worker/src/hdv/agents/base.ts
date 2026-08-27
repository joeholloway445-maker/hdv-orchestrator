import type { AgentId, MemoryRecord } from "../memory_bus.js";
import type { MemoryBus } from "../memory_bus.js";

export interface AgentMessage {
  id: string;
  from: AgentId;
  content: unknown;
  timestamp: number;
}

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  protected bus: MemoryBus;

  constructor(bus: MemoryBus) {
    this.bus = bus;
  }

  protected remember(content: unknown, tags: string[] = []): MemoryRecord {
    return this.bus.push(this.id, content, tags);
  }

  abstract process(input: Record<string, unknown>): Promise<AgentMessage | null>;
}
