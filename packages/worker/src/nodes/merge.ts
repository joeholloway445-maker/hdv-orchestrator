interface NodeDef {
  data: Record<string, unknown>;
}

export function executeMerge(node: NodeDef, $input: Record<string, unknown>): unknown {
  const mode = String(node.data?.mergeMode || "combine");
  const keyField = String(node.data?.keyField || "id");

  // If only one input, always pass through
  const items = $input.items as unknown[] | undefined;
  if (!Array.isArray(items)) return $input;

  switch (mode) {
    case "passThrough":
      // Return the last item
      return items[items.length - 1] ?? $input;

    case "zip": {
      const a = Array.isArray(items[0]) ? (items[0] as unknown[]) : [items[0]];
      const b = Array.isArray(items[1]) ? (items[1] as unknown[]) : [items[1]];
      const len = Math.max(a.length, b.length);
      const zipped = Array.from({ length: len }, (_, i) => ({
        ...(typeof a[i] === "object" && a[i] !== null ? (a[i] as object) : { _a: a[i] }),
        ...(typeof b[i] === "object" && b[i] !== null ? (b[i] as object) : { _b: b[i] }),
      }));
      return { items: zipped };
    }

    case "mergeByKey": {
      const merged: Record<string, Record<string, unknown>> = {};
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const obj = item as Record<string, unknown>;
        const key = String(obj[keyField] ?? "");
        if (key) {
          merged[key] = { ...(merged[key] ?? {}), ...obj };
        }
      }
      return { items: Object.values(merged) };
    }

    case "combine":
    default:
      return { items };
  }
}
