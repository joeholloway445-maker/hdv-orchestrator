/**
 * tests/knoll_audit.test.ts — Tests for KnollAgent's audit logic.
 *
 * KNOLL is the silent guardian: it reads all bus records and flags any
 * that violate the one-way hierarchy. Its audit is the only mechanism
 * that would catch a MemoryBus bug that lets an illegal write through.
 *
 * Since KnollAgent.audit() is private, we exercise it via process() and
 * observe its side-effects: violations reach the console. We also test
 * the freeze threshold (34% violation rate) by directly checking that
 * KNOLL's process() returns null (it never writes).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import { MemoryBus } from "../src/memory/MemoryBus";
import { KnollAgent } from "../src/agents/Knoll";

function tmpBus(): MemoryBus {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-knoll-"));
  return new MemoryBus(dir);
}

// ---------------------------------------------------------------------------
// A. KNOLL always returns null (never writes)
// ---------------------------------------------------------------------------

test("KnollAgent.process() always returns null", async () => {
  const bus = tmpBus();
  bus.push("DREAM", { scene: "init" });
  const knoll = new KnollAgent(bus);
  const result = await knoll.process({});
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// B. Clean bus: no violations logged
// ---------------------------------------------------------------------------

test("clean bus produces no error/warn output", async () => {
  const bus = tmpBus();
  bus.push("DREAM", { ok: true });
  bus.push("VISION", { ok: true });
  bus.push("APEX", { ok: true });

  const warnings: string[] = [];
  const errors: string[] = [];
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));

  try {
    const knoll = new KnollAgent(bus);
    await knoll.process({});
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }

  assert.equal(warnings.filter((w) => w.includes("violation")).length, 0);
  assert.equal(errors.filter((e) => e.includes("FREEZE")).length, 0);
});

// ---------------------------------------------------------------------------
// C. KnollAgent.id is KNOLL
// ---------------------------------------------------------------------------

test("KnollAgent has correct agent ID", () => {
  const bus = tmpBus();
  const knoll = new KnollAgent(bus);
  assert.equal(knoll.id, "KNOLL");
});

// ---------------------------------------------------------------------------
// D. Multiple legal records: KNOLL processes without error
// ---------------------------------------------------------------------------

test("process() handles many legal records without throwing", async () => {
  const bus = tmpBus();
  for (let i = 0; i < 20; i++) bus.push("DREAM", { i });
  for (let i = 0; i < 10; i++) bus.push("VISION", { i });
  const knoll = new KnollAgent(bus);
  await assert.doesNotReject(() => knoll.process({}));
});

// ---------------------------------------------------------------------------
// E. Violation detection — below threshold (warning, not FREEZE)
// ---------------------------------------------------------------------------

test("single illegal record produces audit warning, not FREEZE", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-knoll-viol-"));
  // Pre-seed 9 legal DREAM records via bus, then inject 1 illegal record directly
  const bus = new (await import("../src/memory/MemoryBus")).MemoryBus(dir);
  for (let i = 0; i < 9; i++) bus.push("DREAM", { i });

  // Inject one illegal record: HOPE→DREAM (HOPE is not allowed to write anywhere)
  fs.writeFileSync(path.join(dir, "illegal-001.json"), JSON.stringify({
    id: "illegal-001",
    from: "HOPE",
    to: "DREAM",
    timestamp: Date.now(),
    content: {},
    tags: [],
  }));

  // Load fresh bus so it picks up the injected file
  const bus2 = new (await import("../src/memory/MemoryBus")).MemoryBus(dir);
  const knoll = new KnollAgent(bus2);

  const warnings: string[] = [];
  const errors: string[] = [];
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));

  try {
    await knoll.process({});
  } finally {
    console.warn = origWarn;
    console.error = origError;
  }

  assert.ok(warnings.some((w) => w.includes("violation") || w.includes("Audit")), "expected audit warning");
  assert.equal(errors.filter((e) => e.includes("FREEZE")).length, 0, "should not FREEZE below threshold");
});

// ---------------------------------------------------------------------------
// F. Violation detection — at/above threshold triggers FREEZE
// ---------------------------------------------------------------------------

test("majority illegal records triggers SYSTEM FREEZE error", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hdv-knoll-freeze-"));

  // Inject 4 illegal records + 2 legal = 4/6 ≈ 67% >> 34% threshold
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(dir, `illegal-${i}.json`), JSON.stringify({
      id: `illegal-${i}`,
      from: "HOPE",
      to: "DREAM",
      timestamp: Date.now() + i,
      content: {},
      tags: [],
    }));
  }
  for (let i = 0; i < 2; i++) {
    fs.writeFileSync(path.join(dir, `legal-${i}.json`), JSON.stringify({
      id: `legal-${i}`,
      from: "DREAM",
      to: "VISION",
      timestamp: Date.now() + 100 + i,
      content: {},
      tags: [],
    }));
  }

  const bus = new (await import("../src/memory/MemoryBus")).MemoryBus(dir);
  const knoll = new KnollAgent(bus);

  const errors: string[] = [];
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => errors.push(args.join(" "));

  try {
    await knoll.process({});
  } finally {
    console.error = origError;
  }

  assert.ok(errors.some((e) => e.includes("FREEZE")), "expected SYSTEM FREEZE at high violation rate");
});
