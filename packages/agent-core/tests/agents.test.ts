/**
 * tests/agents.test.ts — Unit tests for DreamAgent, VisionAgent, HopeAgent, ApexAgent.
 *
 * Each agent is tested in isolation: a fresh MemoryBus backed by a temp dir is
 * created per-test so file I/O doesn't bleed between cases.
 *
 * Covers:
 *  A. DreamAgent  — response generation, mood derivation, content shape
 *  B. VisionAgent — synthesis with/without DREAM context, haptic passthrough
 *  C. HopeAgent   — governance directive with/without VISION context
 *  D. ApexAgent   — execution report, haptic dispatch pass-through
 *
 * Run: node --require ts-node/register --test tests/agents.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import { MemoryBus } from "../src/memory/MemoryBus";
import { DreamAgent } from "../src/agents/Dream";
import { VisionAgent } from "../src/agents/Vision";
import { HopeAgent } from "../src/agents/Hope";
import { ApexAgent } from "../src/agents/Apex";

function tmpBus(): MemoryBus {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-agents-"));
  return new MemoryBus(dir);
}

// ---------------------------------------------------------------------------
// A. DreamAgent
// ---------------------------------------------------------------------------

test("DreamAgent.id is DREAM", () => {
  const dream = new DreamAgent(tmpBus());
  assert.equal(dream.id, "DREAM");
});

test("DreamAgent.process() returns a non-null AgentMessage", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.ok(result !== null);
  assert.equal(typeof result!.id, "string");
  assert.equal(result!.from, "DREAM");
  assert.equal(typeof result!.timestamp, "number");
});

test("DreamAgent content type is companion_response", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.equal(result!.content.type, "companion_response");
});

test("DreamAgent default scene is ambient chamber when no world provided", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.equal(result!.content.scene, "ambient chamber");
});

test("DreamAgent scene matches world description when provided", async () => {
  const result = await new DreamAgent(tmpBus()).process({
    world: { description: "mystic forest" },
  });
  assert.equal(result!.content.scene, "mystic forest");
});

test("DreamAgent response is default when no action text", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.equal(result!.content.response, "I'm here with you.");
});

test("DreamAgent response acknowledges 'hey' greetings", async () => {
  const result = await new DreamAgent(tmpBus()).process({
    userAction: { text: "hey there" },
  });
  assert.ok((result!.content.response as string).includes("Hey"));
});

test("DreamAgent response echoes other action text", async () => {
  const result = await new DreamAgent(tmpBus()).process({
    userAction: { text: "what time is it?" },
  });
  assert.ok((result!.content.response as string).includes("I hear you:"));
  assert.ok((result!.content.response as string).includes("what time is it?"));
});

test("DreamAgent mood is warm when intimacy > 0.7", async () => {
  const result = await new DreamAgent(tmpBus()).process({
    userAction: { text: "hello", intimacy: 0.9 },
  });
  assert.equal(result!.content.mood, "warm");
});

test("DreamAgent mood is attentive when intimacy > 0.3", async () => {
  const result = await new DreamAgent(tmpBus()).process({
    userAction: { intimacy: 0.5 },
  });
  assert.equal(result!.content.mood, "attentive");
});

test("DreamAgent mood is calm when intimacy is 0", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.equal(result!.content.mood, "calm");
});

test("DreamAgent content includes a hapticSuggestion object", async () => {
  const result = await new DreamAgent(tmpBus()).process({});
  assert.ok(typeof result!.content.hapticSuggestion === "object");
  assert.ok(result!.content.hapticSuggestion !== null);
});

// ---------------------------------------------------------------------------
// B. VisionAgent
// ---------------------------------------------------------------------------

test("VisionAgent.id is VISION", () => {
  const vision = new VisionAgent(tmpBus());
  assert.equal(vision.id, "VISION");
});

test("VisionAgent.process() returns a non-null AgentMessage", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  assert.ok(result !== null);
  assert.equal(result!.from, "VISION");
});

test("VisionAgent content type is operational_synthesis", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  assert.equal(result!.content.type, "operational_synthesis");
});

test("VisionAgent intent contains 'Standby' when no DREAM records", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  assert.ok((result!.content.intent as string).includes("Standby"));
});

test("VisionAgent dreamRef is null when no DREAM records", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  assert.equal(result!.content.dreamRef, null);
});

test("VisionAgent synthesizes intent from DREAM mood when records exist", async () => {
  const bus = tmpBus();
  // DreamAgent pushes from "DREAM"; bus.push("DREAM",...) is the same source.
  const dream = new DreamAgent(bus);
  await dream.process({ userAction: { text: "hello", intimacy: 0.9 } });

  const result = await new VisionAgent(bus).process({});
  assert.ok((result!.content.intent as string).includes("warm"));
});

test("VisionAgent hapticRecommendation is null without DREAM context", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  assert.equal(result!.content.hapticRecommendation, null);
});

test("VisionAgent worldAdjustment has lightingShift and soundscape", async () => {
  const result = await new VisionAgent(tmpBus()).process({});
  const adj = result!.content.worldAdjustment as Record<string, unknown>;
  assert.equal(typeof adj.lightingShift, "number");
  assert.equal(typeof adj.soundscape, "string");
});

// ---------------------------------------------------------------------------
// C. HopeAgent
// ---------------------------------------------------------------------------

test("HopeAgent.id is HOPE", () => {
  const hope = new HopeAgent(tmpBus());
  assert.equal(hope.id, "HOPE");
});

test("HopeAgent.process() returns a non-null AgentMessage", async () => {
  const result = await new HopeAgent(tmpBus()).process({});
  assert.ok(result !== null);
  assert.equal(result!.from, "HOPE");
});

test("HopeAgent content type is governance_directive", async () => {
  const result = await new HopeAgent(tmpBus()).process({});
  assert.equal(result!.content.type, "governance_directive");
});

test("HopeAgent directive is STANDBY when no VISION records exist", async () => {
  const result = await new HopeAgent(tmpBus()).process({});
  assert.ok((result!.content.directive as string).includes("STANDBY"));
});

test("HopeAgent directive is APPROVED when VISION records exist", async () => {
  const bus = tmpBus();
  const vision = new VisionAgent(bus);
  await vision.process({});  // pushes a VISION record with intent

  const result = await new HopeAgent(bus).process({});
  assert.ok((result!.content.directive as string).includes("APPROVED"));
});

test("HopeAgent APPROVED directive echoes VISION intent", async () => {
  const bus = tmpBus();
  // Seed with a DREAM record first so VISION has context.
  const dream = new DreamAgent(bus);
  await dream.process({ userAction: { text: "rise", intimacy: 0.8 } });
  const vision = new VisionAgent(bus);
  await vision.process({});

  const result = await new HopeAgent(bus).process({});
  const directive = result!.content.directive as string;
  assert.ok(directive.includes("APPROVED"), `Expected APPROVED in: ${directive}`);
  assert.ok(directive.includes("warm"), `Expected mood in: ${directive}`);
});

// ---------------------------------------------------------------------------
// D. ApexAgent
// ---------------------------------------------------------------------------

test("ApexAgent.id is APEX", () => {
  const apex = new ApexAgent(tmpBus());
  assert.equal(apex.id, "APEX");
});

test("ApexAgent.process() returns a non-null AgentMessage", async () => {
  const result = await new ApexAgent(tmpBus()).process({});
  assert.ok(result !== null);
  assert.equal(result!.from, "APEX");
});

test("ApexAgent content type is apex_execution_report", async () => {
  const result = await new ApexAgent(tmpBus()).process({});
  assert.equal(result!.content.type, "apex_execution_report");
});

test("ApexAgent hapticDispatched is null when no haptic input", async () => {
  const result = await new ApexAgent(tmpBus()).process({});
  assert.equal(result!.content.hapticDispatched, null);
});

test("ApexAgent dispatches haptic when haptic field is provided", async () => {
  const result = await new ApexAgent(tmpBus()).process({
    haptic: { intensity: 60, pattern: "pulse", durationMs: 800 },
  });
  const dispatched = result!.content.hapticDispatched as Record<string, unknown>;
  assert.equal(dispatched.dispatched, true);
  assert.equal(dispatched.pattern, "pulse");
  assert.equal(dispatched.intensity, 60);
  assert.equal(dispatched.durationMs, 800);
});

test("ApexAgent content includes a numeric timestamp", async () => {
  const result = await new ApexAgent(tmpBus()).process({});
  assert.equal(typeof result!.content.timestamp, "number");
  assert.ok((result!.content.timestamp as number) > 0);
});
