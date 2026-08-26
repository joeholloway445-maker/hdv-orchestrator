import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function processItem(item: unknown, $input: Record<string, unknown>, mappings: Array<{ key: string; value: string }>): unknown {
  if (mappings.length === 0) return item;
  const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item };
  const out: Record<string, unknown> = { ...obj };
  for (const { key, value } of mappings) {
    const resolved = interpolate(value, { ...$input, ...obj });
    out[key] = resolved !== undefined ? resolved : null;
  }
  return out;
}

export async function executeLoop(node: NodeDef, $input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];
  const parallel = node.data?.parallel === true || node.data?.parallel === "true";

  let processed: unknown[];
  if (parallel) {
    processed = await Promise.all(arr.map((item) => Promise.resolve(processItem(item, $input, mappings))));
  } else {
    processed = [];
    for (const item of arr) {
      processed.push(processItem(item, $input, mappings));
    }
  }

  return { ...$input, [arrayKey]: processed, _loopCount: processed.length };
}
