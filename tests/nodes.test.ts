/**
 * tests/nodes.test.ts — Unit tests for pure worker node functions.
 *
 * Covers:
 *  A. executeValidate   — field rules: required, type, length, pattern, numeric range, flag mode
 *  B. executeFilter     — operators: equals/notEquals/contains/gt/lt/exists, AND/OR combine
 *  C. interpolate       — $json, $input, $vars, $now, $timestamp, single vs multi expression,
 *                         array index access with bracket notation
 *  D. executeLoop       — $item.index / $item.count context, parallel mode
 *  E. executeIfBranch   — AND/OR conditions, all operators, _branch output
 *  F. executeSet        — mappings with interpolation, passthrough
 *  G. executeSwitch     — matched case, default case, nested field
 *  H. executeAggregate  — arrayKey, outputKey, flatten, count
 *  I. executeTransform  — keepInput, dot-path output keys, null for missing
 *  J. executeCrypto     — sha256, base64encode/decode, urlencode, hmac_sha256
 *  K. executeSort       — asc/desc, sortField, primitives
 *  L. executeLimit      — start/end keepFrom, maxItems
 *  M. executeDeduplicate — removeSubsequent, keepLast, dedupeField
 *  N. executeRenameKeys  — from→to, removeOldKeys default
 *
 * Run: node --require ts-node/register --test tests/nodes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { executeValidate }  from "../packages/worker/src/nodes/validate";
import { executeFilter }    from "../packages/worker/src/nodes/filter";
import { interpolate }      from "../packages/worker/src/lib/expr";
import { executeLoop }      from "../packages/worker/src/nodes/loop";
import { executeIfBranch }   from "../packages/worker/src/nodes/ifBranch";
import { executeSet }        from "../packages/worker/src/nodes/set";
import { executeSwitch }     from "../packages/worker/src/nodes/switch";
import { executeAggregate }  from "../packages/worker/src/nodes/aggregate";
import { executeTransform }  from "../packages/worker/src/nodes/transform";
import { executeCrypto }     from "../packages/worker/src/nodes/crypto";
import { executeSort }       from "../packages/worker/src/nodes/sort";
import { executeLimit }      from "../packages/worker/src/nodes/limit";
import { executeDeduplicate } from "../packages/worker/src/nodes/deduplicate";
import { executeRenameKeys } from "../packages/worker/src/nodes/renameKeys";

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

// ---------------------------------------------------------------------------
// E. executeIfBranch
// ---------------------------------------------------------------------------

function ifNode(conditions: object[], combineMode = "AND") {
  return { data: { conditions, combineMode } };
}

test("ifBranch: equals → true branch", () => {
  const r = executeIfBranch(ifNode([{ field: "status", operator: "equals", value: "ok" }]), { status: "ok" });
  assert.equal(r._branch, "true");
});

test("ifBranch: equals → false branch when value differs", () => {
  const r = executeIfBranch(ifNode([{ field: "status", operator: "equals", value: "ok" }]), { status: "fail" });
  assert.equal(r._branch, "false");
});

test("ifBranch: notEquals → true when values differ", () => {
  const r = executeIfBranch(ifNode([{ field: "role", operator: "notEquals", value: "admin" }]), { role: "user" });
  assert.equal(r._branch, "true");
});

test("ifBranch: gt → true when actual > expected", () => {
  const r = executeIfBranch(ifNode([{ field: "score", operator: "gt", value: "50" }]), { score: 99 });
  assert.equal(r._branch, "true");
});

test("ifBranch: lt → false when actual >= expected", () => {
  const r = executeIfBranch(ifNode([{ field: "score", operator: "lt", value: "50" }]), { score: 50 });
  assert.equal(r._branch, "false");
});

test("ifBranch: gte → true when equal", () => {
  const r = executeIfBranch(ifNode([{ field: "n", operator: "gte", value: "10" }]), { n: 10 });
  assert.equal(r._branch, "true");
});

test("ifBranch: lte → true when less than", () => {
  const r = executeIfBranch(ifNode([{ field: "n", operator: "lte", value: "10" }]), { n: 5 });
  assert.equal(r._branch, "true");
});

test("ifBranch: contains → true when substring present", () => {
  const r = executeIfBranch(ifNode([{ field: "msg", operator: "contains", value: "error" }]), { msg: "fatal error occurred" });
  assert.equal(r._branch, "true");
});

test("ifBranch: startsWith → true", () => {
  const r = executeIfBranch(ifNode([{ field: "url", operator: "startsWith", value: "https" }]), { url: "https://example.com" });
  assert.equal(r._branch, "true");
});

test("ifBranch: endsWith → true", () => {
  const r = executeIfBranch(ifNode([{ field: "file", operator: "endsWith", value: ".json" }]), { file: "data.json" });
  assert.equal(r._branch, "true");
});

test("ifBranch: exists → true when field is present", () => {
  const r = executeIfBranch(ifNode([{ field: "token", operator: "exists", value: "" }]), { token: "abc" });
  assert.equal(r._branch, "true");
});

test("ifBranch: notExists → true when field absent", () => {
  const r = executeIfBranch(ifNode([{ field: "token", operator: "notExists", value: "" }]), {});
  assert.equal(r._branch, "true");
});

test("ifBranch: isTrue → true for boolean true", () => {
  const r = executeIfBranch(ifNode([{ field: "active", operator: "isTrue", value: "" }]), { active: true });
  assert.equal(r._branch, "true");
});

test("ifBranch: isFalse → true for boolean false", () => {
  const r = executeIfBranch(ifNode([{ field: "active", operator: "isFalse", value: "" }]), { active: false });
  assert.equal(r._branch, "true");
});

test("ifBranch: isEmpty → true for empty string", () => {
  const r = executeIfBranch(ifNode([{ field: "name", operator: "isEmpty", value: "" }]), { name: "" });
  assert.equal(r._branch, "true");
});

test("ifBranch: isNotEmpty → true for non-empty string", () => {
  const r = executeIfBranch(ifNode([{ field: "name", operator: "isNotEmpty", value: "" }]), { name: "Alice" });
  assert.equal(r._branch, "true");
});

test("ifBranch: matches regex → true", () => {
  const r = executeIfBranch(ifNode([{ field: "code", operator: "matches", value: "^[A-Z]{3}$" }]), { code: "ABC" });
  assert.equal(r._branch, "true");
});

test("ifBranch: notMatches regex → true when no match", () => {
  const r = executeIfBranch(ifNode([{ field: "code", operator: "notMatches", value: "^[0-9]+$" }]), { code: "ABC" });
  assert.equal(r._branch, "true");
});

test("ifBranch: AND — all must pass", () => {
  const r = executeIfBranch(
    ifNode([{ field: "a", operator: "equals", value: "1" }, { field: "b", operator: "equals", value: "2" }], "AND"),
    { a: "1", b: "2" }
  );
  assert.equal(r._branch, "true");
});

test("ifBranch: AND — one fails → false branch", () => {
  const r = executeIfBranch(
    ifNode([{ field: "a", operator: "equals", value: "1" }, { field: "b", operator: "equals", value: "2" }], "AND"),
    { a: "1", b: "X" }
  );
  assert.equal(r._branch, "false");
});

test("ifBranch: OR — one passes → true branch", () => {
  const r = executeIfBranch(
    ifNode([{ field: "a", operator: "equals", value: "X" }, { field: "b", operator: "equals", value: "2" }], "OR"),
    { a: "1", b: "2" }
  );
  assert.equal(r._branch, "true");
});

test("ifBranch: no conditions → false branch", () => {
  const r = executeIfBranch({ data: { conditions: [], combineMode: "AND" } }, { x: 1 });
  assert.equal(r._branch, "false");
});

test("ifBranch: input fields preserved in output", () => {
  const r = executeIfBranch(ifNode([{ field: "x", operator: "equals", value: "1" }]), { x: "1", extra: "keep" });
  assert.equal(r.extra, "keep");
  assert.equal(r._branch, "true");
});

// ---------------------------------------------------------------------------
// F. executeSet
// ---------------------------------------------------------------------------

test("set: maps a static value", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "greeting", value: "Hello" }] } },
    {}
  );
  assert.equal(r.greeting, "Hello");
});

test("set: interpolates from $input", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "label", value: "User: {{ $input.name }}" }] } },
    { name: "Alice" }
  );
  assert.equal(r.label, "User: Alice");
});

test("set: can overwrite existing fields", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "status", value: "active" }] } },
    { status: "inactive" }
  );
  assert.equal(r.status, "active");
});

test("set: preserves unmapped fields from $input", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "x", value: "1" }] } },
    { y: "original" }
  );
  assert.equal(r.y, "original");
  assert.equal(r.x, "1");
});

test("set: multiple mappings all applied", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "a", value: "1" }, { key: "b", value: "2" }, { key: "c", value: "3" }] } },
    {}
  );
  assert.equal(r.a, "1");
  assert.equal(r.b, "2");
  assert.equal(r.c, "3");
});

test("set: empty mappings → returns $input unchanged", () => {
  const r = executeSet({ data: { mappings: [] } }, { foo: "bar" });
  assert.equal(r.foo, "bar");
});

test("set: mapping can reference sibling field via $input", () => {
  const r = executeSet(
    { data: { mappings: [{ key: "doubled", value: "{{ $input.count }}" }] } },
    { count: 7 }
  );
  assert.equal(r.doubled, 7);
});

// ---------------------------------------------------------------------------
// G. executeSwitch
// ---------------------------------------------------------------------------

test("switch: matched case → correct output", () => {
  const r = executeSwitch(
    { data: { field: "env", cases: [{ value: "prod", output: "production" }, { value: "dev", output: "development" }], defaultOutput: "unknown" } },
    { env: "prod" }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "production");
});

test("switch: no match → defaultOutput", () => {
  const r = executeSwitch(
    { data: { field: "env", cases: [{ value: "prod", output: "production" }], defaultOutput: "fallback" } },
    { env: "staging" }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "fallback");
});

test("switch: second case matches", () => {
  const r = executeSwitch(
    { data: { field: "tier", cases: [{ value: "free", output: "basic" }, { value: "pro", output: "premium" }], defaultOutput: "unknown" } },
    { tier: "pro" }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "premium");
});

test("switch: numeric field value matched as string", () => {
  const r = executeSwitch(
    { data: { field: "code", cases: [{ value: "200", output: "ok" }, { value: "404", output: "not_found" }], defaultOutput: "other" } },
    { code: 404 }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "not_found");
});

test("switch: nested field via dot path", () => {
  const r = executeSwitch(
    { data: { field: "user.role", cases: [{ value: "admin", output: "full" }], defaultOutput: "limited" } },
    { user: { role: "admin" } }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "full");
});

test("switch: empty cases always defaults", () => {
  const r = executeSwitch(
    { data: { field: "x", cases: [], defaultOutput: "none" } },
    { x: "anything" }
  ) as Record<string, unknown>;
  assert.equal(r._switch, "none");
});

test("switch: input fields preserved", () => {
  const r = executeSwitch(
    { data: { field: "status", cases: [{ value: "on", output: "active" }], defaultOutput: "off" } },
    { status: "on", extra: "keep" }
  ) as Record<string, unknown>;
  assert.equal(r.extra, "keep");
  assert.equal(r._switch, "active");
});

// ---------------------------------------------------------------------------
// H. executeAggregate
// ---------------------------------------------------------------------------

test("aggregate: collects items from arrayKey into outputKey", () => {
  const r = executeAggregate(
    { data: { arrayKey: "items", outputKey: "results" } },
    { items: [1, 2, 3] }
  );
  assert.deepEqual(r.results, [1, 2, 3]);
  assert.equal(r.count, 3);
});

test("aggregate: defaults arrayKey to items and outputKey to results", () => {
  const r = executeAggregate({ data: {} }, { items: ["a", "b"] });
  assert.deepEqual(r.results, ["a", "b"]);
});

test("aggregate: flatten=true merges nested arrays", () => {
  const r = executeAggregate(
    { data: { arrayKey: "batches", outputKey: "all", flatten: true } },
    { batches: [[1, 2], [3, 4], [5]] }
  );
  assert.deepEqual(r.all, [1, 2, 3, 4, 5]);
  assert.equal(r.count, 5);
});

test("aggregate: flatten=false keeps nested arrays intact", () => {
  const r = executeAggregate(
    { data: { arrayKey: "batches", outputKey: "all", flatten: false } },
    { batches: [[1, 2], [3]] }
  );
  assert.deepEqual(r.all, [[1, 2], [3]]);
  assert.equal(r.count, 2);
});

test("aggregate: empty array → count 0", () => {
  const r = executeAggregate({ data: { arrayKey: "items", outputKey: "results" } }, { items: [] });
  assert.equal(r.count, 0);
  assert.deepEqual(r.results, []);
});

test("aggregate: falls back to $input.items when arrayKey not found", () => {
  const r = executeAggregate(
    { data: { arrayKey: "missing", outputKey: "out" } },
    { items: [10, 20] }
  );
  assert.deepEqual(r.out, [10, 20]);
});

test("aggregate: input fields preserved alongside new outputKey", () => {
  const r = executeAggregate(
    { data: { arrayKey: "items", outputKey: "collected" } },
    { items: [1], meta: "keep" }
  );
  assert.equal(r.meta, "keep");
  assert.deepEqual(r.collected, [1]);
});

// ---------------------------------------------------------------------------
// I. executeTransform
// ---------------------------------------------------------------------------

test("transform: maps a value via interpolation", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "greeting", value: "Hello {{ $input.name }}" }] } },
    { name: "World" }
  );
  assert.equal(r.greeting, "Hello World");
});

test("transform: keepInput=true preserves input fields", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "x", value: "1" }], keepInput: true } },
    { original: "keep" }
  );
  assert.equal(r.original, "keep");
  assert.equal(r.x, "1");
});

test("transform: keepInput=false (default) produces only mapped keys", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "only", value: "this" }] } },
    { original: "dropped" }
  );
  assert.equal(r.only, "this");
  assert.equal(r.original, undefined);
});

test("transform: dot-path output key creates nested object", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "user.email", value: "a@b.com" }], keepInput: false } },
    {}
  );
  assert.deepEqual(r.user, { email: "a@b.com" });
});

test("transform: missing interpolation resolves to null", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "val", value: "{{ $input.missing }}" }] } },
    {}
  );
  assert.equal(r.val, null);
});

test("transform: multiple mappings all present", () => {
  const r = executeTransform(
    { data: { mappings: [{ key: "a", value: "1" }, { key: "b", value: "2" }] } },
    {}
  );
  assert.equal(r.a, "1");
  assert.equal(r.b, "2");
});

// ---------------------------------------------------------------------------
// J. executeCrypto
// ---------------------------------------------------------------------------

test("crypto: sha256 produces 64-char hex string", () => {
  const r = executeCrypto(
    { data: { operation: "sha256", inputField: "hello", outputField: "hash" } },
    {}
  );
  assert.ok(typeof r.hash === "string" && (r.hash as string).length === 64);
});

test("crypto: base64encode then base64decode round-trips", () => {
  const encoded = executeCrypto(
    { data: { operation: "base64encode", inputField: "hello world", outputField: "enc" } },
    {}
  );
  const decoded = executeCrypto(
    { data: { operation: "base64decode", inputField: encoded.enc as string, outputField: "dec" } },
    {}
  );
  assert.equal(decoded.dec, "hello world");
});

test("crypto: urlencode encodes special chars", () => {
  const r = executeCrypto(
    { data: { operation: "urlencode", inputField: "hello world & foo=bar", outputField: "enc" } },
    {}
  );
  assert.equal(r.enc, "hello%20world%20%26%20foo%3Dbar");
});

test("crypto: hmac_sha256 produces consistent output", () => {
  const r1 = executeCrypto(
    { data: { operation: "hmac_sha256", inputField: "msg", secretKey: "key", outputField: "sig" } },
    {}
  );
  const r2 = executeCrypto(
    { data: { operation: "hmac_sha256", inputField: "msg", secretKey: "key", outputField: "sig" } },
    {}
  );
  assert.equal(r1.sig, r2.sig);
  assert.ok(typeof r1.sig === "string" && (r1.sig as string).length === 64);
});

test("crypto: uuid produces a UUID-shaped string", () => {
  const r = executeCrypto(
    { data: { operation: "uuid", outputField: "id" } },
    {}
  );
  assert.match(r.id as string, /^[0-9a-f-]{36}$/);
});

test("crypto: input fields preserved", () => {
  const r = executeCrypto(
    { data: { operation: "sha256", inputField: "x", outputField: "hash" } },
    { extra: "keep" }
  );
  assert.equal(r.extra, "keep");
});

// ---------------------------------------------------------------------------
// K. executeSort
// ---------------------------------------------------------------------------

test("sort: asc by primitive values", () => {
  const r = executeSort(
    { data: { arrayKey: "items", direction: "asc" } },
    { items: [3, 1, 2] }
  );
  assert.deepEqual(r.items, [1, 2, 3]);
});

test("sort: desc by primitive values", () => {
  const r = executeSort(
    { data: { arrayKey: "items", direction: "desc" } },
    { items: [3, 1, 2] }
  );
  assert.deepEqual(r.items, [3, 2, 1]);
});

test("sort: by sortField asc", () => {
  const r = executeSort(
    { data: { arrayKey: "items", sortField: "score", direction: "asc" } },
    { items: [{ score: 30 }, { score: 10 }, { score: 20 }] }
  );
  assert.deepEqual((r.items as Array<{ score: number }>).map((x) => x.score), [10, 20, 30]);
});

test("sort: by sortField desc", () => {
  const r = executeSort(
    { data: { arrayKey: "items", sortField: "name", direction: "desc" } },
    { items: [{ name: "Bob" }, { name: "Alice" }, { name: "Charlie" }] }
  );
  assert.deepEqual((r.items as Array<{ name: string }>).map((x) => x.name), ["Charlie", "Bob", "Alice"]);
});

test("sort: non-array passes through unchanged", () => {
  const r = executeSort(
    { data: { arrayKey: "items" } },
    { items: "not-array" }
  );
  assert.equal(r.items, "not-array");
});

// ---------------------------------------------------------------------------
// L. executeLimit
// ---------------------------------------------------------------------------

test("limit: keeps first N from start", () => {
  const r = executeLimit(
    { data: { arrayKey: "items", maxItems: 3, keepFrom: "start" } },
    { items: [1, 2, 3, 4, 5] }
  );
  assert.deepEqual(r.items, [1, 2, 3]);
});

test("limit: keeps last N from end", () => {
  const r = executeLimit(
    { data: { arrayKey: "items", maxItems: 2, keepFrom: "end" } },
    { items: [1, 2, 3, 4, 5] }
  );
  assert.deepEqual(r.items, [4, 5]);
});

test("limit: maxItems larger than array keeps all", () => {
  const r = executeLimit(
    { data: { arrayKey: "items", maxItems: 100 } },
    { items: [1, 2] }
  );
  assert.deepEqual(r.items, [1, 2]);
});

test("limit: maxItems=0 returns empty", () => {
  const r = executeLimit(
    { data: { arrayKey: "items", maxItems: 0 } },
    { items: [1, 2, 3] }
  );
  assert.deepEqual(r.items, []);
});

test("limit: non-array passes through unchanged", () => {
  const r = executeLimit(
    { data: { arrayKey: "items", maxItems: 2 } },
    { items: "not-array" }
  );
  assert.equal(r.items, "not-array");
});

// ---------------------------------------------------------------------------
// M. executeDeduplicate
// ---------------------------------------------------------------------------

test("deduplicate: removeSubsequent keeps first occurrence", () => {
  const r = executeDeduplicate(
    { data: { arrayKey: "items", strategy: "removeSubsequent" } },
    { items: [1, 2, 1, 3, 2] }
  );
  assert.deepEqual(r.items, [1, 2, 3]);
});

test("deduplicate: keepLast keeps last occurrence", () => {
  const r = executeDeduplicate(
    { data: { arrayKey: "items", dedupeField: "id", strategy: "keepLast" } },
    { items: [{ id: 1, v: "a" }, { id: 2, v: "b" }, { id: 1, v: "c" }] }
  );
  const items = r.items as Array<{ id: number; v: string }>;
  const item1 = items.find((x) => x.id === 1);
  assert.equal(item1?.v, "c");
});

test("deduplicate: by dedupeField", () => {
  const r = executeDeduplicate(
    { data: { arrayKey: "items", dedupeField: "email", strategy: "removeSubsequent" } },
    { items: [{ email: "a@b.com" }, { email: "c@d.com" }, { email: "a@b.com" }] }
  );
  assert.equal((r.items as unknown[]).length, 2);
});

test("deduplicate: no duplicates → same array length", () => {
  const r = executeDeduplicate(
    { data: { arrayKey: "items" } },
    { items: [1, 2, 3] }
  );
  assert.equal((r.items as unknown[]).length, 3);
});

// ---------------------------------------------------------------------------
// N. executeRenameKeys
// ---------------------------------------------------------------------------

test("renameKeys: renames a top-level key", () => {
  const r = executeRenameKeys(
    { data: { mappings: [{ from: "old", to: "new" }] } },
    { old: "value" }
  );
  assert.equal(r.new, "value");
  assert.equal(r.old, undefined);
});

test("renameKeys: removeOldKeys=false keeps original key", () => {
  const r = executeRenameKeys(
    { data: { mappings: [{ from: "src", to: "dst" }], removeOldKeys: false } },
    { src: "data" }
  );
  assert.equal(r.dst, "data");
  assert.equal(r.src, "data");
});

test("renameKeys: unmapped keys preserved", () => {
  const r = executeRenameKeys(
    { data: { mappings: [{ from: "a", to: "b" }] } },
    { a: "1", c: "3" }
  );
  assert.equal(r.b, "1");
  assert.equal(r.c, "3");
});

test("renameKeys: from=to mapping is a no-op (skipped)", () => {
  const r = executeRenameKeys(
    { data: { mappings: [{ from: "x", to: "x" }] } },
    { x: "keep" }
  );
  assert.equal(r.x, "keep");
});

test("renameKeys: missing source key results in no change", () => {
  const r = executeRenameKeys(
    { data: { mappings: [{ from: "missing", to: "target" }] } },
    { unrelated: "data" }
  );
  assert.equal(r.target, undefined);
  assert.equal(r.unrelated, "data");
});
