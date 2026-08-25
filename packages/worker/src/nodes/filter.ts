interface NodeDef {
  data: Record<string, unknown>;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce(
    (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

export function executeFilter(node: NodeDef, $input: Record<string, unknown>): unknown {
  const arrayKey = String(node.data?.arrayKey || "items");
  const condition = String(node.data?.condition || "true");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];

  const filtered = arr.filter((item) => {
    try {
      const fn = new Function("item", "$input", "get", `"use strict"; return !!(${condition});`);
      return Boolean(fn(item, $input, get));
    } catch {
      return false;
    }
  });

  return { ...$input, [arrayKey]: filtered, _filterCount: filtered.length };
}
