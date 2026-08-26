import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function processItem(
  item: unknown,
  $input: Record<string, unknown>,
  mappings: Array<{ key: string; value: string }>,
  index: number,
  total: number,
): unknown {
  const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item };
  // Inject $item context so templates can use {{ $item.index }}, {{ $item.count }}, {{ $item.isLast }}
  const $item = { index, count: total, isFirst: index === 0, isLast: index === total - 1, value: item };
  const ctx = { ...$input, ...obj, $item };
  if (mappings.length === 0) return { ...obj, $item };
  const out: Record<string, unknown> = { ...obj };
  for (const { key, value } of mappings) {
    const resolved = interpolate(value, ctx);
    out[key] = resolved !== undefined ? resolved : null;
  }
  return out;
}

export async function executeLoop(node: NodeDef, $input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];
  const parallel = node.data?.parallel === true || node.data?.parallel === "true";
  const total = arr.length;

  let processed: unknown[];
  if (parallel) {
    processed = await Promise.all(arr.map((item, i) => Promise.resolve(processItem(item, $input, mappings, i, total))));
  } else {
    processed = [];
    for (let i = 0; i < arr.length; i++) {
      processed.push(processItem(arr[i], $input, mappings, i, total));
    }
  }

  return { ...$input, [arrayKey]: processed, _loopCount: processed.length };
}
