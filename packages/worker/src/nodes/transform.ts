import { interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in cur) || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function executeTransform(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];
  const keepInput = !!node.data?.keepInput;

  const output: Record<string, unknown> = keepInput ? { ...$input } : {};

  for (const { key, value } of mappings) {
    if (!key) continue;
    const resolved = interpolate(value, $input);
    setPath(output, key, resolved ?? null);
  }

  return output;
}
