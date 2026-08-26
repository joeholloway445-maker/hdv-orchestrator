import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  SPILL_THRESHOLD,
  isSpillRef,
  storePayload,
  resolvePayload,
  cleanupPayloads,
  payloadSummary,
} from "../packages/worker/src/lib/payload";

// ── isSpillRef ────────────────────────────────────────────────────

describe("isSpillRef", () => {
  test("returns false for null", () => {
    assert.equal(isSpillRef(null), false);
  });

  test("returns false for a plain object", () => {
    assert.equal(isSpillRef({ foo: "bar" }), false);
  });

  test("returns false for a string", () => {
    assert.equal(isSpillRef("hello"), false);
  });

  test("returns true for a valid SpillRef", () => {
    const ref = { __spilled__: true, path: "/tmp/x.json", sizeBytes: 1000 };
    assert.equal(isSpillRef(ref), true);
  });

  test("returns false when __spilled__ is not true", () => {
    const ref = { __spilled__: false, path: "/tmp/x.json", sizeBytes: 1000 };
    assert.equal(isSpillRef(ref), false);
  });
});

// ── storePayload & resolvePayload ─────────────────────────────────

describe("storePayload — small payload (under threshold)", () => {
  test("returns the original value unchanged", async () => {
    const payload = { count: 7, name: "Alice" };
    const result = await storePayload("exec-1", "node-a", payload);
    assert.deepEqual(result, payload);
    assert.equal(isSpillRef(result), false);
  });

  test("returns a primitive unchanged", async () => {
    const result = await storePayload("exec-2", "node-b", 42);
    assert.equal(result, 42);
  });

  test("returns null unchanged", async () => {
    const result = await storePayload("exec-3", "node-c", null);
    assert.equal(result, null);
  });
});

describe("storePayload — large payload (above threshold)", () => {
  test("spills to disk and returns a SpillRef", async () => {
    const big = { data: "x".repeat(SPILL_THRESHOLD + 1) };
    const ref = await storePayload("exec-spill-1", "node-big", big);
    assert.equal(isSpillRef(ref), true);
    if (isSpillRef(ref)) {
      assert.ok(ref.sizeBytes >= SPILL_THRESHOLD);
      // verify the file actually exists
      await assert.doesNotReject(fs.access(ref.path));
      // clean up
      await fs.rm(path.dirname(ref.path), { recursive: true, force: true });
    }
  });

  test("round-trips through resolvePayload", async () => {
    const big = { data: "r".repeat(SPILL_THRESHOLD + 1), meta: "round-trip" };
    const ref = await storePayload("exec-spill-2", "node-rt", big);
    assert.equal(isSpillRef(ref), true);
    const restored = await resolvePayload(ref);
    assert.deepEqual(restored, big);
    if (isSpillRef(ref)) {
      await fs.rm(path.dirname(ref.path), { recursive: true, force: true });
    }
  });
});

describe("resolvePayload — non-SpillRef passthrough", () => {
  test("returns a plain object unchanged", async () => {
    const v = { a: 1 };
    assert.deepEqual(await resolvePayload(v), v);
  });

  test("returns null unchanged", async () => {
    assert.equal(await resolvePayload(null), null);
  });

  test("returns a string unchanged", async () => {
    assert.equal(await resolvePayload("hello"), "hello");
  });
});

// ── cleanupPayloads ───────────────────────────────────────────────

describe("cleanupPayloads", () => {
  test("removes all files for the execution", async () => {
    const big = { data: "y".repeat(SPILL_THRESHOLD + 1) };
    const ref = await storePayload("exec-cleanup", "node-del", big) as { path: string };
    assert.equal(isSpillRef(ref), true);
    const dir = path.dirname(ref.path);

    await cleanupPayloads("exec-cleanup");
    await assert.rejects(fs.access(dir), "directory should be gone after cleanup");
  });

  test("does not throw when execution had no spilled files", async () => {
    await assert.doesNotReject(cleanupPayloads("exec-nonexistent-xyz"));
  });
});

// ── payloadSummary ────────────────────────────────────────────────

describe("payloadSummary", () => {
  test("returns small payload unchanged", () => {
    const v = { a: 1 };
    assert.deepEqual(payloadSummary(v), v);
  });

  test("truncates large inline payloads", () => {
    const big = { data: "z".repeat(SPILL_THRESHOLD + 1) };
    const summary = payloadSummary(big) as Record<string, unknown>;
    assert.equal(summary._truncated, true);
    assert.ok(typeof summary.preview === "string");
    assert.ok((summary.preview as string).length <= 512);
  });

  test("replaces SpillRef with a stub", async () => {
    const big = { data: "w".repeat(SPILL_THRESHOLD + 1) };
    const ref = await storePayload("exec-summary", "node-s", big);
    assert.equal(isSpillRef(ref), true);
    const summary = payloadSummary(ref) as Record<string, unknown>;
    assert.equal(summary._spilled, true);
    assert.ok(typeof summary.sizeBytes === "number");
    if (isSpillRef(ref)) {
      await fs.rm(path.dirname(ref.path), { recursive: true, force: true });
    }
  });
});
