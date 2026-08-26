/**
 * tests/nodes.test.ts — Unit tests for pure worker node functions.
 *
 * Covers:
 *  A. executeValidate — field rules: required, type, length, pattern, numeric range, flag mode
 *  B. executeFilter   — operators: equals/notEquals/contains/gt/lt/exists, AND/OR combine
 *  C. interpolate     — $json, $input, $vars, $now, $timestamp, single vs multi expression,
 *                       array index access with bracket notation
 *  D. executeLoop     — $item.index / $item.count context, parallel mode
 *
 * Run: node --require ts-node/register --test tests/nodes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { executeValidate } from "../packages/worker/src/nodes/validate";
import { executeFilter }   from "../packages/worker/src/nodes/filter";
import { interpolate }     from "../packages/worker/src/lib/expr";
import { executeLoop }     from "../packages/worker/src/nodes/loop";

// ---------------------------------------------------------------------------
// A. executeValidate
// ---------------------------------------------------------------------------

test("validate: required field present → passes", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "name", required: true }], mode: "flag" } },
    { name: "Alice" }
  );
  assert.equal(result._validationPassed, true);
  assert.equal((result._validationErrors as string[]).length, 0);
});

test("validate: required field missing → fails", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "name", required: true }], mode: "flag" } },
    {}
  );
  assert.equal(result._validationPassed, false);
  assert.ok((result._validationErrors as string[]).some((e) => e.includes('"name"')));
});

test("validate: required field empty string → fails", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "email", required: true }], mode: "flag" } },
    { email: "" }
  );
  assert.equal(result._validationPassed, false);
});

test("validate: type string passes when value is string", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "tag", type: "string" }], mode: "flag" } },
    { tag: "hello" }
  );
  assert.equal(result._validationPassed, true);
});

test("validate: type number fails when value is string", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "age", type: "number" }], mode: "flag" } },
    { age: "old" }
  );
  assert.equal(result._validationPassed, false);
  assert.ok((result._validationErrors as string[]).some((e) => e.includes('"age"')));
});

test("validate: type array passes for real array", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "items", type: "array" }], mode: "flag" } },
    { items: [1, 2, 3] }
  );
  assert.equal(result._validationPassed, true);
});

test("validate: minLength violation → error", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "pw", minLength: "8" }], mode: "flag" } },
    { pw: "short" }
  );
  assert.equal(result._validationPassed, false);
  assert.ok((result._validationErrors as string[]).some((e) => e.includes("at least 8")));
});

test("validate: maxLength violation → error", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "bio", maxLength: "10" }], mode: "flag" } },
    { bio: "this is way too long for the limit" }
  );
  assert.equal(result._validationPassed, false);
});

test("validate: pattern mismatch → error", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "code", pattern: "^[A-Z]{3}$" }], mode: "flag" } },
    { code: "abc" }
  );
  assert.equal(result._validationPassed, false);
});

test("validate: pattern match → passes", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "code", pattern: "^[A-Z]{3}$" }], mode: "flag" } },
    { code: "XYZ" }
  );
  assert.equal(result._validationPassed, true);
});

test("validate: min numeric violation → error", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "score", min: "0" }], mode: "flag" } },
    { score: -1 }
  );
  assert.equal(result._validationPassed, false);
});

test("validate: max numeric violation → error", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "score", max: "100" }], mode: "flag" } },
    { score: 200 }
  );
  assert.equal(result._validationPassed, false);
});

test("validate: mode=throw throws on failure", () => {
  assert.throws(() =>
    executeValidate(
      { data: { rules: [{ field: "x", required: true }], mode: "throw" } },
      {}
    ),
    /Validation failed/
  );
});

test("validate: mode=flag does not throw, returns errors in output", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "x", required: true }], mode: "flag" } },
    {}
  );
  assert.equal(result._validationPassed, false);
  assert.ok(Array.isArray(result._validationErrors));
});

test("validate: nested field access via dot path", () => {
  const result = executeValidate(
    { data: { rules: [{ field: "user.name", required: true }], mode: "flag" } },
    { user: { name: "Bob" } }
  );
  assert.equal(result._validationPassed, true);
});

test("validate: input fields preserved in output", () => {
  const result = executeValidate(
    { data: { rules: [], mode: "flag" } },
    { foo: "bar", count: 42 }
  );
  assert.equal(result.foo, "bar");
  assert.equal(result.count, 42);
});

// ---------------------------------------------------------------------------
// B. executeFilter
// ---------------------------------------------------------------------------

function filterNode(conditions: object[], combineMode = "AND", arrayKey = "items") {
  return { data: { arrayKey, conditions, combineMode } };
}

test("filter: equals operator passes matching item", () => {
  const result = executeFilter(
    filterNode([{ field: "status", operator: "equals", value: "active" }]),
    { items: [{ status: "active" }, { status: "inactive" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: notEquals removes matching item", () => {
  const result = executeFilter(
    filterNode([{ field: "status", operator: "notEquals", value: "deleted" }]),
    { items: [{ status: "active" }, { status: "deleted" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: contains operator works on strings", () => {
  const result = executeFilter(
    filterNode([{ field: "name", operator: "contains", value: "cat" }]),
    { items: [{ name: "concatenate" }, { name: "dog" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: gt operator keeps items above threshold", () => {
  const result = executeFilter(
    filterNode([{ field: "score", operator: "gt", value: "50" }]),
    { items: [{ score: 60 }, { score: 40 }, { score: 50 }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: lt operator keeps items below threshold", () => {
  const result = executeFilter(
    filterNode([{ field: "age", operator: "lt", value: "18" }]),
    { items: [{ age: 12 }, { age: 25 }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: exists keeps only items with the field", () => {
  const result = executeFilter(
    filterNode([{ field: "email", operator: "exists", value: "" }]),
    { items: [{ email: "a@b.com" }, { name: "no email" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: notExists keeps items without the field", () => {
  const result = executeFilter(
    filterNode([{ field: "deleted_at", operator: "notExists", value: "" }]),
    { items: [{ id: 1 }, { id: 2, deleted_at: "2024-01-01" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: OR combine mode — any condition passes keeps item", () => {
  const result = executeFilter(
    filterNode(
      [
        { field: "role", operator: "equals", value: "admin" },
        { field: "role", operator: "equals", value: "mod" },
      ],
      "OR"
    ),
    { items: [{ role: "admin" }, { role: "mod" }, { role: "user" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 2);
});

test("filter: AND combine mode — all conditions must pass", () => {
  const result = executeFilter(
    filterNode(
      [
        { field: "active", operator: "equals", value: "true" },
        { field: "verified", operator: "equals", value: "true" },
      ],
      "AND"
    ),
    { items: [{ active: "true", verified: "true" }, { active: "true", verified: "false" }, { active: "false", verified: "true" }] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 1);
});

test("filter: no conditions → returns all items", () => {
  const result = executeFilter(
    { data: { arrayKey: "items", conditions: [], combineMode: "AND" } },
    { items: [1, 2, 3] }
  ) as Record<string, unknown>;
  assert.equal((result.items as unknown[]).length, 3);
});

test("filter: _filterCount reflects filtered count", () => {
  const result = executeFilter(
    filterNode([{ field: "x", operator: "equals", value: "1" }]),
    { items: [{ x: "1" }, { x: "2" }] }
  ) as Record<string, unknown>;
  assert.equal(result._filterCount, 1);
});

// ---------------------------------------------------------------------------
// C. interpolate
// ---------------------------------------------------------------------------

test("interpolate: plain string with no expressions passes through", () => {
  assert.equal(interpolate("hello world", {}), "hello world");
});

test("interpolate: single $input. expression returns typed value", () => {
  assert.equal(interpolate("{{ $input.count }}", { count: 42 }), 42);
});

test("interpolate: $json. is alias for $input.", () => {
  assert.equal(interpolate("{{ $json.name }}", { name: "Alice" }), "Alice");
});

test("interpolate: multi-expression template returns string", () => {
  const result = interpolate("Hello {{ $input.name }}, you have {{ $input.count }} items", {
    name: "Bob",
    count: 5,
  });
  assert.equal(result, "Hello Bob, you have 5 items");
});

test("interpolate: $vars. reads from $vars namespace", () => {
  const result = interpolate("{{ $vars.API_KEY }}", { $vars: { API_KEY: "secret" } });
  assert.equal(result, "secret");
});

test("interpolate: $now returns an ISO date string", () => {
  const result = interpolate("{{ $now }}", {});
  assert.ok(typeof result === "string" && (result as string).includes("T"));
});

test("interpolate: $timestamp returns a number", () => {
  const result = interpolate("{{ $timestamp }}", {});
  assert.ok(typeof result === "number" && (result as number) > 0);
});

test("interpolate: missing field returns undefined for single expression", () => {
  const result = interpolate("{{ $input.missing }}", {});
  assert.equal(result, undefined);
});

test("interpolate: nested dot path access", () => {
  const result = interpolate("{{ $input.user.city }}", { user: { city: "Portland" } });
  assert.equal(result, "Portland");
});

test("interpolate: non-string template returned as-is", () => {
  const result = interpolate(42 as unknown as string, {});
  assert.equal(result, 42);
});

test("interpolate: bracket index [0] accesses first array element", () => {
  const result = interpolate("{{ $input.items[0] }}", { items: ["alpha", "beta"] });
  assert.equal(result, "alpha");
});

test("interpolate: bracket index [-1] accesses last array element", () => {
  const result = interpolate("{{ $input.items[-1] }}", { items: ["a", "b", "c"] });
  assert.equal(result, "c");
});

test("interpolate: bracket index with nested field", () => {
  const result = interpolate("{{ $input.users[1].name }}", { users: [{ name: "Alice" }, { name: "Bob" }] });
  assert.equal(result, "Bob");
});

test("interpolate: out-of-bounds bracket index returns undefined in multi-expr context", () => {
  const result = interpolate("val: {{ $input.items[99] }}", { items: [1, 2] });
  assert.equal(result, "val: ");
});

// ---------------------------------------------------------------------------
// D. executeLoop — $item context
// ---------------------------------------------------------------------------

test("loop: items pass through unchanged when no mappings", async () => {
  const result = await executeLoop(
    { data: { arrayKey: "items" } },
    { items: [{ a: 1 }, { a: 2 }] }
  );
  const items = result.items as Array<Record<string, unknown>>;
  assert.equal(items.length, 2);
  assert.equal(items[0].a, 1);
  assert.equal(items[1].a, 2);
});

test("loop: $item.index is injected into each item", async () => {
  const result = await executeLoop(
    { data: { arrayKey: "items" } },
    { items: ["x", "y", "z"] }
  );
  const items = result.items as Array<{ $item: { index: number; count: number; isFirst: boolean; isLast: boolean } }>;
  assert.equal(items[0].$item.index, 0);
  assert.equal(items[0].$item.isFirst, true);
  assert.equal(items[0].$item.isLast, false);
  assert.equal(items[2].$item.index, 2);
  assert.equal(items[2].$item.isLast, true);
  assert.equal(items[0].$item.count, 3);
});

test("loop: mappings can reference $item.index", async () => {
  const result = await executeLoop(
    { data: { arrayKey: "items", mappings: [{ key: "position", value: "{{ $item.index }}" }] } },
    { items: [{ v: "a" }, { v: "b" }] }
  );
  const items = result.items as Array<{ position: number }>;
  assert.equal(items[0].position, 0);
  assert.equal(items[1].position, 1);
});

test("loop: parallel mode produces same results as serial", async () => {
  const serial = await executeLoop(
    { data: { arrayKey: "items" } },
    { items: [1, 2, 3] }
  );
  const parallel = await executeLoop(
    { data: { arrayKey: "items", parallel: true } },
    { items: [1, 2, 3] }
  );
  assert.deepEqual(serial.items, parallel.items);
});

test("loop: _loopCount reflects processed count", async () => {
  const result = await executeLoop(
    { data: { arrayKey: "items" } },
    { items: [1, 2, 3, 4, 5] }
  );
  assert.equal(result._loopCount, 5);
});
