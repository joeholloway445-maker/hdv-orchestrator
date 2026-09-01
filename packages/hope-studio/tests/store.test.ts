/**
 * tests/store.test.ts — Unit tests for StudioStore CRUD operations.
 *
 * Run: node --require ts-node/register --test tests/store.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { StudioStore } from "../src/store";
import type { Persona, Scenario, Scene } from "../src/types";

function makePersona(id: string): Persona {
  return {
    id,
    name: `Persona ${id}`,
    personality: "curious and warm",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeScene(id: string, scenarioId: string): Scene {
  return {
    id,
    scenarioId,
    name: `Scene ${id}`,
    lines: [{ speaker: "hope", text: "Hello" }],
    choices: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeScenario(id: string, personaId: string, scenes: Scene[] = []): Scenario {
  return {
    id,
    personaId,
    title: `Scenario ${id}`,
    entrySceneId: scenes[0]?.id ?? "s0",
    scenes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// A. Persona CRUD
// ---------------------------------------------------------------------------

test("upsertPersona then getPersona returns the persona", () => {
  const store = new StudioStore();
  const p = makePersona("p1");
  store.upsertPersona(p);
  const got = store.getPersona("p1");
  assert.ok(got);
  assert.equal(got.id, "p1");
  assert.equal(got.name, "Persona p1");
});

test("getPersona returns undefined for missing id", () => {
  const store = new StudioStore();
  assert.equal(store.getPersona("nope"), undefined);
});

test("listPersonas returns all upserted personas", () => {
  const store = new StudioStore();
  store.upsertPersona(makePersona("a"));
  store.upsertPersona(makePersona("b"));
  store.upsertPersona(makePersona("c"));
  assert.equal(store.listPersonas().length, 3);
});

test("upsertPersona overwrites an existing persona", () => {
  const store = new StudioStore();
  store.upsertPersona({ ...makePersona("p1"), name: "Original" });
  store.upsertPersona({ ...makePersona("p1"), name: "Updated" });
  assert.equal(store.getPersona("p1")?.name, "Updated");
  assert.equal(store.listPersonas().length, 1);
});

test("deletePersona removes the persona and returns true", () => {
  const store = new StudioStore();
  store.upsertPersona(makePersona("p1"));
  assert.equal(store.deletePersona("p1"), true);
  assert.equal(store.getPersona("p1"), undefined);
});

test("deletePersona returns false for unknown id", () => {
  const store = new StudioStore();
  assert.equal(store.deletePersona("nope"), false);
});

test("upsertPersona stamps updatedAt", () => {
  const store = new StudioStore();
  const before = new Date().toISOString();
  store.upsertPersona(makePersona("p1"));
  const after = new Date().toISOString();
  const updatedAt = store.getPersona("p1")?.updatedAt ?? "";
  assert.ok(updatedAt >= before && updatedAt <= after);
});

// ---------------------------------------------------------------------------
// B. Scenario CRUD
// ---------------------------------------------------------------------------

test("upsertScenario then getScenario returns the scenario", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  const got = store.getScenario("sc1");
  assert.ok(got);
  assert.equal(got.id, "sc1");
});

test("getScenario returns undefined for missing id", () => {
  const store = new StudioStore();
  assert.equal(store.getScenario("nope"), undefined);
});

test("listScenariosForPersona filters by personaId", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  store.upsertScenario(makeScenario("sc2", "p1"));
  store.upsertScenario(makeScenario("sc3", "p2"));
  const forP1 = store.listScenariosForPersona("p1");
  assert.equal(forP1.length, 2);
  assert.ok(forP1.every((s) => s.personaId === "p1"));
});

test("deleteScenario removes and returns true", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  assert.equal(store.deleteScenario("sc1"), true);
  assert.equal(store.getScenario("sc1"), undefined);
});

test("deleteScenario returns false for unknown id", () => {
  const store = new StudioStore();
  assert.equal(store.deleteScenario("nope"), false);
});

// ---------------------------------------------------------------------------
// C. Scene CRUD (nested in scenario)
// ---------------------------------------------------------------------------

test("upsertScene adds a scene to an existing scenario", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  const scene = makeScene("s1", "sc1");
  const ok = store.upsertScene("sc1", scene);
  assert.equal(ok, true);
  const got = store.getScene("sc1", "s1");
  assert.ok(got);
  assert.equal(got.id, "s1");
});

test("upsertScene returns false for unknown scenario", () => {
  const store = new StudioStore();
  assert.equal(store.upsertScene("nope", makeScene("s1", "nope")), false);
});

test("upsertScene overwrites an existing scene", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  store.upsertScene("sc1", { ...makeScene("s1", "sc1"), name: "Original" });
  store.upsertScene("sc1", { ...makeScene("s1", "sc1"), name: "Updated" });
  assert.equal(store.getScene("sc1", "s1")?.name, "Updated");
  assert.equal(store.getScenario("sc1")?.scenes.length, 1);
});

test("getScene returns undefined for unknown scene", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  assert.equal(store.getScene("sc1", "nope"), undefined);
});

test("getScene returns undefined for unknown scenario", () => {
  const store = new StudioStore();
  assert.equal(store.getScene("nope", "s1"), undefined);
});

test("deleteScene removes scene and returns true", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  store.upsertScene("sc1", makeScene("s1", "sc1"));
  assert.equal(store.deleteScene("sc1", "s1"), true);
  assert.equal(store.getScene("sc1", "s1"), undefined);
});

test("deleteScene returns false when scene does not exist", () => {
  const store = new StudioStore();
  store.upsertScenario(makeScenario("sc1", "p1"));
  assert.equal(store.deleteScene("sc1", "nope"), false);
});

test("deleteScene returns false for unknown scenario", () => {
  const store = new StudioStore();
  assert.equal(store.deleteScene("nope", "s1"), false);
});
