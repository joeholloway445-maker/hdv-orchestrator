interface NodeDef {
  data: Record<string, unknown>;
}

export function executeAggregate(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const outputKey = String(node.data?.outputKey || "results");

  // Support both a named array field and the multi-parent { items: [...] } envelope
  let arr: unknown[] = [];
  if (Array.isArray($input[arrayKey])) {
    arr = $input[arrayKey] as unknown[];
  } else if (Array.isArray($input.items)) {
    arr = $input.items as unknown[];
  }

  // Optionally flatten one level if items are arrays themselves
  const flatten = !!node.data?.flatten;
  const result = flatten ? arr.flat(1) : arr;

  return { ...$input, [outputKey]: result, count: result.length };
}
