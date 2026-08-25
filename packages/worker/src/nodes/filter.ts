import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

interface FilterCondition {
  field: string;
  operator: string;
  value: string;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce(
    (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

function evalStructured(cond: FilterCondition, item: unknown, $input: Record<string, unknown>): boolean {
  const actual = get(item, cond.field);
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
    default: return false;
  }
}

export function executeFilter(node: NodeDef, $input: Record<string, unknown>): unknown {
  const arrayKey = String(node.data?.arrayKey || "items");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];
  const conditions = node.data?.conditions as FilterCondition[] | undefined;
  const combineMode = String(node.data?.combineMode || "AND");

  const filtered = arr.filter((item) => {
    if (conditions && conditions.length > 0) {
      const results = conditions.map((c) => evalStructured(c, item, $input));
      return combineMode === "OR" ? results.some(Boolean) : results.every(Boolean);
    }
    return true;
  });

  return { ...$input, [arrayKey]: filtered, _filterCount: filtered.length };
}
