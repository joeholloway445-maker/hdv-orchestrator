import "dotenv/config";
import { MemoryBus } from "./memory/MemoryBus";
import { HopeAgent } from "./agents/Hope";
import { VisionAgent } from "./agents/Vision";
import { DreamAgent } from "./agents/Dream";
import { KnollAgent } from "./agents/Knoll";
import { ApexAgent } from "./agents/Apex";
import { HapticClient } from "./haptic/HapticClient";
import { WorldModel } from "./world/WorldModel";

async function main() {
  console.log("=== HDV Agent Core starting ===");
  console.log("Strict one-way memory hierarchy active\n");

  const bus = new MemoryBus(process.env.MEMORY_PERSIST_PATH);
  const hope = new HopeAgent(bus);
  const vision = new VisionAgent(bus);
  const dream = new DreamAgent(bus);
  const knoll = new KnollAgent(bus);
  const apex = new ApexAgent(bus);
  const haptic = new HapticClient();
  const world = new WorldModel();

  // Simple demo cycle
  const worldState = await world.generate(
    "User enters a private subliminal chamber with a companion present"
  );

  const dreamMsg = await dream.process({
    world: worldState,
    userAction: { intimacy: 0.4, text: "Hey..." },
  });

  const visionMsg = await vision.process({});
  const hopeMsg = await hope.process({});
  await knoll.process({}); // silent
  await apex.process({
    haptic: { intensity: 15, pattern: "soft-pulse", durationMs: 2000 },
  });

  // Fire a low-intensity haptic (dry-run if no key)
  await haptic.send({ intensity: 15, pattern: "soft-pulse", durationMs: 2000 });

  console.log("\n=== Cycle complete ===");
  console.log("Recent HOPE-visible memory:");
  console.dir(bus.read("HOPE", 8), { depth: 3 });
}

main().catch(console.error);
