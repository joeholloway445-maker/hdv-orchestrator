interface NodeDef {
  data: Record<string, unknown>;
}

export function executeSplitBatches(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const batchSize = Math.max(1, parseInt(String(node.data?.batchSize || "10"), 10));
  const outputKey = String(node.data?.outputKey || "batch");

  let items: unknown[] = [];
  if (Array.isArray($input[arrayKey])) {
    items = $input[arrayKey] as unknown[];
  } else if (Array.isArray($input.items)) {
    items = $input.items as unknown[];
  } else {
    // If input is a single object, wrap it
    items = Object.keys($input).length ? [$input] : [];
  }

  const batches: unknown[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const firstBatch = batches[0] ?? [];
  return {
    ...$input,
    [outputKey]: firstBatch,
    _batches: batches,
    _batchIndex: 0,
    _batchCount: batches.length,
    _totalItems: items.length,
    _isLastBatch: batches.length <= 1,
  };
}
