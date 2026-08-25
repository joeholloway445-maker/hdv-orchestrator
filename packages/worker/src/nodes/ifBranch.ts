import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function evalCondition(cond: Condition, $input: Record<string, unknown>): boolean {
  const actual = get($input, cond.field);
  const raw = interpolate(cond.value || "", $input);
  const expected = raw !== undefined && raw !== null ? String(raw) : "";

  switch (cond.operator) {
    case "equals":      return String(actual ?? "") === expected;
    case "notEquals":   return String(actual ?? "") !== expected;
    case "contains":    return typeof actual === "string" && actual.includes(expected);
    case "notContains": return typeof actual === "string" && !actual.includes(expected);
    case "startsWith":  return typeof actual === "string" && actual.startsWith(expected);
    case "endsWith":    return typeof actual === "string" && actual.endsWith(expected);
    case "gt":          return Number(actual) > Number(expected);
    case "lt":          return Number(actual) < Number(expected);
    case "gte":         return Number(actual) >= Number(expected);
    case "lte":         return Number(actual) <= Number(expected);
    case "exists":      return actual !== undefined && actual !== null;
    case "notExists":   return actual === undefined || actual === null;
    case "isTrue":      return actual === true || actual === "true" || actual === 1;
    case "isFalse":     return actual === false || actual === "false" || actual === 0;
    case "isEmpty":
      return actual === "" || actual === null || actual === undefined ||
             (Array.isArray(actual) && actual.length === 0);
    case "isNotEmpty":
      return actual !== "" && actual !== null && actual !== undefined &&
             !(Array.isArray(actual) && actual.length === 0);
    case "matches":
      try { return new RegExp(expected).test(String(actual ?? "")); } catch { return false; }
    case "notMatches":
      try { return !new RegExp(expected).test(String(actual ?? "")); } catch { return false; }
    default: return false;
  }
}

export function executeIfBranch(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const conditions = node.data?.conditions as Condition[] | undefined;
  const combineMode = String(node.data?.combineMode || "AND");

  let result = false;

  if (conditions && conditions.length > 0) {
    const results = conditions.map((c) => evalCondition(c, $input));
    result = combineMode === "OR" ? results.some(Boolean) : results.every(Boolean);
  } else {
    result = false;
  }

  return { ...$input, _branch: result ? "true" : "false" };
}
