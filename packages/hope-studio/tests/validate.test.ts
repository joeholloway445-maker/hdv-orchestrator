/**
 * tests/validate.test.ts — Unit tests for validateScenario.
 *
 * Run: node --require ts-node/register --test tests/validate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateScenario } from "../src/validate";
import type { Scenario, Scene } from "../src/types";

const NOW = new Date().toISOString();

function scene(id: string, scenarioId: string, choices: { id: string; label?: string; nextSceneId?: string }[] = [], terminal = false): Scene {
  return { id, scenarioId, name: id, lines: [], choices: choices.map((c) => ({ label: c.id, ...c })), terminal, createdAt: NOW, updatedAt: NOW };
}

function scenario(entrySceneId: string, scenes: Scene[]): Scenario {
  return {
    id: "sc1", personaId: "p1", title: "Test",
    entrySceneId, scenes,
    createdAt: NOW, updatedAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// A. Valid scenarios
// ---------------------------------------------------------------------------

test("single terminal scene is valid", () => {
  const s = scene("s1", "sc1", [], true);
  const result = validateScenario(scenario("s1", [s]));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("linear two-scene scenario is valid", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "s2" }]);
  const s2 = scene("s2", "sc1", [], true);
  const result = validateScenario(scenario("s1", [s1, s2]));
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("branching scenario with multiple terminals is valid", () => {
  const s1 = scene("s1", "sc1", [
    { id: "c1", nextSceneId: "s2" },
    { id: "c2", nextSceneId: "s3" },
  ]);
  const s2 = scene("s2", "sc1", [], true);
  const s3 = scene("s3", "sc1", [], true);
  const result = validateScenario(scenario("s1", [s1, s2, s3]));
  assert.equal(result.ok, true);
});

test("choice with no nextSceneId is valid (open-ended terminal)", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1" }]);
  const result = validateScenario(scenario("s1", [s1]));
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// B. Entry scene errors
// ---------------------------------------------------------------------------

test("missing entrySceneId produces error", () => {
  const s1 = scene("s1", "sc1", [], true);
  const result = validateScenario(scenario("MISSING", [s1]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("entrySceneId")));
});

// ---------------------------------------------------------------------------
// C. Choice target errors
// ---------------------------------------------------------------------------

test("choice pointing to unknown scene produces error", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "GHOST" }]);
  const result = validateScenario(scenario("s1", [s1]));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("GHOST")));
});

test("multiple bad choice targets all produce errors", () => {
  const s1 = scene("s1", "sc1", [
    { id: "c1", nextSceneId: "X" },
    { id: "c2", nextSceneId: "Y" },
  ]);
  const result = validateScenario(scenario("s1", [s1]));
  assert.equal(result.errors.length, 2);
});

// ---------------------------------------------------------------------------
// D. Unreachable scene warnings
// ---------------------------------------------------------------------------

test("unreachable scene produces warning, not error", () => {
  const s1 = scene("s1", "sc1", [], true);
  const s2 = scene("s2", "sc1", [], true); // unreachable — no choice points here
  const result = validateScenario(scenario("s1", [s1, s2]));
  assert.equal(result.ok, true); // only a warning
  assert.ok(result.warnings.some((w) => w.includes("s2") && w.includes("unreachable")));
});

// ---------------------------------------------------------------------------
// E. No terminal scene warning
// ---------------------------------------------------------------------------

test("cycle with no terminal scene produces warning", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "s1" }]);
  const result = validateScenario(scenario("s1", [s1]));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("terminal") || w.includes("exit")));
});

// ---------------------------------------------------------------------------
// F-extra. Terminal flag and cycle edge cases
// ---------------------------------------------------------------------------

test("scene with terminal:true and choices still counts as terminal", () => {
  // terminal OR choices.length===0 — both satisfy, but test the flag path explicitly
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "s2" }]);
  const s2 = scene("s2", "sc1", [{ id: "c2", nextSceneId: "s1" }], true); // cycle but terminal=true
  const result = validateScenario(scenario("s1", [s1, s2]));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.filter((w) => w.includes("terminal") || w.includes("exit")).length, 0);
});

test("two-node mutual cycle with no terminal produces warning", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "s2" }]);
  const s2 = scene("s2", "sc1", [{ id: "c2", nextSceneId: "s1" }]);
  const result = validateScenario(scenario("s1", [s1, s2]));
  assert.equal(result.ok, true); // no errors
  assert.ok(result.warnings.some((w) => w.includes("terminal") || w.includes("exit")));
});

test("diamond graph is valid (two paths converge at terminal)", () => {
  const s1 = scene("s1", "sc1", [{ id: "c1", nextSceneId: "s2" }, { id: "c2", nextSceneId: "s3" }]);
  const s2 = scene("s2", "sc1", [{ id: "c3", nextSceneId: "s4" }]);
  const s3 = scene("s3", "sc1", [{ id: "c4", nextSceneId: "s4" }]);
  const s4 = scene("s4", "sc1", [], true);
  const result = validateScenario(scenario("s1", [s1, s2, s3, s4]));
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 0);
});

// ---------------------------------------------------------------------------
// G-extra. Empty scenes edge case
// ---------------------------------------------------------------------------

test("empty scenes array with bad entrySceneId produces error", () => {
  const result = validateScenario(scenario("s1", []));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("entrySceneId")));
});

// ---------------------------------------------------------------------------
// H. ValidationResult shape
// ---------------------------------------------------------------------------

test("result always has ok, errors, and warnings", () => {
  const s1 = scene("s1", "sc1", [], true);
  const result = validateScenario(scenario("s1", [s1]));
  assert.ok(typeof result.ok === "boolean");
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
});
