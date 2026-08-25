interface NodeDef {
  data: Record<string, unknown>;
}

function getPath(obj: unknown, path: string): unknown {
  return path.trim().split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function interpolate(template: string, data: unknown): unknown {
  // Pure path reference: {{path}} → returns the raw value (not stringified)
  const pureRef = template.match(/^\{\{(.+?)\}\}$/);
  if (pureRef) {
    const val = getPath(data, pureRef[1]);
    return val !== undefined ? val : null;
  }
  // Mixed template with multiple placeholders → always stringify
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = getPath(data, key);
    return val !== undefined ? String(val) : "";
  });
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
    setPath(output, key, resolved);
  }

  return output;
}
