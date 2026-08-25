import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

export function executeSet(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];
  const output = { ...$input };
  for (const { key, value } of mappings) {
    output[key] = interpolate(value, $input);
  }
  return output;
}
