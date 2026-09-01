/**
 * tests/haptic_world.test.ts — Tests for HapticClient and WorldModel dry-run paths.
 *
 * Both modules fall back to local behaviour when their respective API URLs
 * are unset, making all these tests network-free.
 *
 * Run: node --require ts-node/register --test tests/haptic_world.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { HapticClient } from "../src/haptic/HapticClient";
import { WorldModel } from "../src/world/WorldModel";

// Ensure URL env vars are clear for the entire test file.
delete process.env.HAPTIC_API_URL;
delete process.env.WORLD_API_URL;

// ---------------------------------------------------------------------------
// A. HapticClient — dry-run (no HAPTIC_API_URL)
// ---------------------------------------------------------------------------

test("HapticClient.send returns ok:true in dry-run mode", async () => {
  const client = new HapticClient();
  const result = await client.send({ intensity: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.message, "dry-run");
});

test("HapticClient.send dry-run works with full command", async () => {
  const client = new HapticClient();
  const result = await client.send({
    deviceId: "glove-left",
    intensity: 80,
    pattern: "pulse",
    durationMs: 200,
  });
  assert.equal(result.ok, true);
  assert.equal(result.message, "dry-run");
});

test("HapticClient.send dry-run works with intensity:0", async () => {
  const client = new HapticClient();
  const result = await client.send({ intensity: 0 });
  assert.equal(result.ok, true);
});

test("HapticClient.send dry-run works with intensity:100", async () => {
  const client = new HapticClient();
  const result = await client.send({ intensity: 100 });
  assert.equal(result.ok, true);
});

test("HapticClient.ping returns false when no URL set", async () => {
  const client = new HapticClient();
  const ok = await client.ping();
  assert.equal(ok, false);
});

// ---------------------------------------------------------------------------
// B. WorldModel — stub (no WORLD_API_URL)
// ---------------------------------------------------------------------------

test("WorldModel.generate returns a WorldState with correct shape", async () => {
  const model = new WorldModel();
  const state = await model.generate("test prompt");
  assert.ok(typeof state.sceneId === "string" && state.sceneId.length > 0);
  assert.ok(typeof state.description === "string");
  assert.ok(Array.isArray(state.entities));
});

test("WorldModel.generate stub echoes prompt as description", async () => {
  const model = new WorldModel();
  const state = await model.generate("casino lobby at night");
  assert.equal(state.description, "casino lobby at night");
});

test("WorldModel.generate stub includes user and companion entities", async () => {
  const model = new WorldModel();
  const state = await model.generate("any");
  const types = state.entities.map((e: any) => e.type);
  assert.ok(types.includes("user"));
  assert.ok(types.includes("companion"));
});

test("WorldModel.generate stub sets mood to calm", async () => {
  const model = new WorldModel();
  const state = await model.generate("any");
  assert.equal(state.mood, "calm");
});

test("WorldModel.generate stub sceneId is unique per call", async () => {
  const model = new WorldModel();
  const a = await model.generate("same prompt");
  await new Promise((r) => setTimeout(r, 2)); // ensure timestamp differs
  const b = await model.generate("same prompt");
  assert.notEqual(a.sceneId, b.sceneId);
});

test("WorldModel.generate handles empty prompt", async () => {
  const model = new WorldModel();
  const state = await model.generate("");
  assert.ok(typeof state.sceneId === "string");
  assert.equal(state.description, "");
});
