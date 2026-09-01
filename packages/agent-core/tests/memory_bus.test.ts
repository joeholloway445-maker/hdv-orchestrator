/**
 * tests/memory_bus.test.ts — Unit tests for the MemoryBus one-way hierarchy.
 *
 * The MemoryBus is the single enforcement layer that prevents illegal routing
 * (e.g. HOPE writing to DREAM, VISION writing to APEX). Any regression here
 * would silently break the agent architecture invariant.
 *
 * Each test gets its own isolated tmpdir so disk writes don't bleed across runs.
 *
 * Run: node --require ts-node/register --test tests/memory_bus.test.ts
 *      (or via npm test after the script is updated)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import { MemoryBus } from "../src/memory/MemoryBus";

function tmpBus(): MemoryBus {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-bus-"));
  return new MemoryBus(dir);
}

// ---------------------------------------------------------------------------
// A. Legal upward pushes succeed
// ---------------------------------------------------------------------------

test("DREAM → VISION push succeeds and returns a record", () => {
  const bus = tmpBus();
  const rec = bus.push("DREAM", { phase: "init" }, ["test"]);
  assert.equal(rec.from, "DREAM");
  assert.equal(rec.to, "VISION");
  assert.ok(typeof rec.id === "string" && rec.id.length > 0);
  assert.deepEqual(rec.tags, ["test"]);
});

test("VISION → HOPE push succeeds", () => {
  const bus = tmpBus();
  const rec = bus.push("VISION", { intent: "observe" });
  assert.equal(rec.from, "VISION");
  assert.equal(rec.to, "HOPE");
});

test("APEX → HOPE push succeeds", () => {
  const bus = tmpBus();
  const rec = bus.push("APEX", { haptic: "sent" });
  assert.equal(rec.from, "APEX");
  assert.equal(rec.to, "HOPE");
});

// ---------------------------------------------------------------------------
// B. Illegal pushes throw
// ---------------------------------------------------------------------------

test("HOPE push succeeds with to=UPWARD (apex of hierarchy)", () => {
  const bus = tmpBus();
  const rec = bus.push("HOPE", { directive: "approved" });
  assert.equal(rec.from, "HOPE");
  assert.equal(rec.to, "UPWARD");
});

test("KNOLL push throws (silent agent, no outbound)", () => {
  const bus = tmpBus();
  assert.throws(() => bus.push("KNOLL", { audit: true }), /Illegal/);
});

// ---------------------------------------------------------------------------
// C. Read permissions per agent
// ---------------------------------------------------------------------------

test("KNOLL reads all records", () => {
  const bus = tmpBus();
  bus.push("DREAM", { a: 1 });
  bus.push("VISION", { b: 2 });
  const records = bus.read("KNOLL", 50);
  assert.equal(records.length, 2);
});

test("HOPE reads all records", () => {
  const bus = tmpBus();
  bus.push("DREAM", { x: 1 });
  bus.push("VISION", { y: 2 });
  const records = bus.read("HOPE", 50);
  assert.equal(records.length, 2);
});

test("VISION reads only DREAM and VISION records", () => {
  const bus = tmpBus();
  bus.push("DREAM", { d: 1 });
  bus.push("VISION", { v: 2 });
  bus.push("APEX", { a: 3 });
  const records = bus.read("VISION", 50);
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.from === "DREAM" || r.from === "VISION"));
});

test("DREAM reads only its own records", () => {
  const bus = tmpBus();
  bus.push("DREAM", { mine: true });
  bus.push("VISION", { notMine: true });
  const records = bus.read("DREAM", 50);
  assert.equal(records.length, 1);
  assert.equal(records[0].from, "DREAM");
});

test("APEX reads only its own records", () => {
  const bus = tmpBus();
  bus.push("DREAM", { d: 1 });
  bus.push("APEX", { a: 1 });
  const records = bus.read("APEX", 50);
  assert.equal(records.length, 1);
  assert.equal(records[0].from, "APEX");
});

// ---------------------------------------------------------------------------
// D. Limit parameter is respected
// ---------------------------------------------------------------------------

test("read limit caps returned records", () => {
  const bus = tmpBus();
  for (let i = 0; i < 10; i++) bus.push("DREAM", { i });
  const records = bus.read("KNOLL", 3);
  assert.equal(records.length, 3);
});

// ---------------------------------------------------------------------------
// E. Persistence: records survive a new MemoryBus instance on the same dir
// ---------------------------------------------------------------------------

test("records persist across MemoryBus instances", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-persist-"));
  const bus1 = new MemoryBus(dir);
  const rec = bus1.push("DREAM", { persisted: true });

  const bus2 = new MemoryBus(dir);
  const records = bus2.read("KNOLL", 50);
  assert.ok(records.some((r) => r.id === rec.id));
});
