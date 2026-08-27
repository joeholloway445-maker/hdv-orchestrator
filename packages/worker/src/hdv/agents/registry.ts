/**
 * HDV Big Five agent registry.
 * Singleton instances share a single MemoryBus backed by globalMemoryBus.
 * Maps node-type strings → agent instances for use in the BullMQ executor.
 */
import type { BaseAgent } from "./base.js";
import type { MemoryBus } from "../memory_bus.js";
import { globalMemoryBus } from "../memory_bus.js";
import { DreamAgent } from "./dream.js";
import { VisionAgent } from "./vision.js";
import { HopeAgent } from "./hope.js";
import { KnollAgent } from "./knoll.js";
import { ApexAgent } from "./apex.js";

const sharedBus: MemoryBus = globalMemoryBus;

const dreamAgent = new DreamAgent(sharedBus);
const visionAgent = new VisionAgent(sharedBus);
const hopeAgent = new HopeAgent(sharedBus);
const knollAgent = new KnollAgent(sharedBus);
const apexAgent = new ApexAgent(sharedBus);

const AGENT_MAP: Record<string, BaseAgent> = {
  // DREAM — simulation, generation, scenario
  dream: dreamAgent,
  simulate: dreamAgent,
  generate: dreamAgent,
  // VISION — automation and trigger
  vision: visionAgent,
  automation: visionAgent,
  // HOPE — auth gateway / governance
  hope: hopeAgent,
  // KNOLL — silent sentinel / security audit
  knoll: knollAgent,
  // APEX — MoE router
  apex: apexAgent,
};

/** Return the agent responsible for the given node type, or null if unrecognised. */
export function getAgent(nodeType: string): BaseAgent | null {
  return AGENT_MAP[nodeType] ?? null;
}

/** Return the shared MemoryBus used by all agent singletons. */
export function getMemoryBus(): MemoryBus {
  return sharedBus;
}
