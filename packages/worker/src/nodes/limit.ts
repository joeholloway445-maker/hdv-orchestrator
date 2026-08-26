interface NodeDef {
  data: Record<string, unknown>;
}

export function executeLimit(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const maxItems = Math.max(0, Number(node.data?.maxItems ?? 10));
  const keepFrom = String(node.data?.keepFrom || "start");

  const raw = $input[arrayKey];
  if (!Array.isArray(raw)) {
    return { ...$input, [arrayKey]: raw };
  }

  const arr = raw as unknown[];
  const limited = keepFrom === "end" ? arr.slice(-maxItems) : arr.slice(0, maxItems);
  return { ...$input, [arrayKey]: limited };
}
