import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

export function executeLoop(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];

  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];

  const processed = arr.map((item) => {
    if (mappings.length === 0) return item;
    const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item };
    const out: Record<string, unknown> = { ...obj };
    for (const { key, value } of mappings) {
      const resolved = interpolate(value, { ...$input, ...obj });
      out[key] = resolved !== undefined ? resolved : null;
    }
    return out;
  });

  return { ...$input, [arrayKey]: processed, _loopCount: processed.length };
}
