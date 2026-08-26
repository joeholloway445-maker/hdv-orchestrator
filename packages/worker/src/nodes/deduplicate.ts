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

function stableKey(val: unknown): string {
  if (val === null || val === undefined) return "__null__";
  if (typeof val === "object") return JSON.stringify(val, Object.keys(val as object).sort());
  return String(val);
}

export function executeDeduplicate(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const dedupeField = node.data?.dedupeField as string | undefined;
  const strategy = String(node.data?.strategy || "removeSubsequent");

  const raw = $input[arrayKey];
  if (!Array.isArray(raw)) {
    return { ...$input, [arrayKey]: raw };
  }

  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const item of raw as unknown[]) {
    const keyVal = dedupeField ? getNestedValue(item, dedupeField) : item;
    const key = stableKey(keyVal);

    if (strategy === "removeSubsequent") {
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    } else {
      // keepLast — overwrite; collect all, dedupe from end
      result.push(item);
    }
  }

  if (strategy === "keepLast") {
    const reversed: unknown[] = [];
    const seenLast = new Set<string>();
    for (let i = result.length - 1; i >= 0; i--) {
      const item = result[i];
      const keyVal = dedupeField ? getNestedValue(item, dedupeField) : item;
      const key = stableKey(keyVal);
      if (!seenLast.has(key)) {
        seenLast.add(key);
        reversed.push(item);
      }
    }
    return { ...$input, [arrayKey]: reversed.reverse() };
  }

  return { ...$input, [arrayKey]: result };
}
