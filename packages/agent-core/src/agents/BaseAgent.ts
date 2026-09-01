import { AgentId, AgentMessage } from "../core/types";
import { MemoryBus } from "../memory/MemoryBus";

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  protected bus: MemoryBus;

  constructor(bus: MemoryBus) {
    this.bus = bus;
  }

  /** Every agent can only push upward (enforced by MemoryBus) */
  protected remember(content: any, tags: string[] = []) {
    return this.bus.push(this.id, content, tags);
  }

  abstract process(input: any): Promise<AgentMessage | null>;
}
