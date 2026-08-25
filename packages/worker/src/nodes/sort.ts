interface NodeDef {
  data: Record<string, unknown>;
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function executeSort(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const sortField = node.data?.sortField as string | undefined;
  const direction = String(node.data?.direction || "asc");

  const raw = $input[arrayKey];
  if (!Array.isArray(raw)) {
    return { ...$input, [arrayKey]: raw };
  }

  const sorted = [...(raw as unknown[])].sort((a, b) => {
    const va = sortField ? getNestedValue(a, sortField) : a;
    const vb = sortField ? getNestedValue(b, sortField) : b;
    const cmp = compareValues(va, vb);
    return direction === "desc" ? -cmp : cmp;
  });

  return { ...$input, [arrayKey]: sorted };
}
