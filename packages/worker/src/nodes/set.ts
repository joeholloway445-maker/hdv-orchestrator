interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: Record<string, unknown>): unknown {
  // If the whole string is a single {{expr}}, return the resolved value directly
  const single = template.match(/^\{\{(.+?)\}\}$/);
  if (single) {
    const key = single[1].trim();
    return key.split(".").reduce((acc: unknown, k) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
      return undefined;
    }, data);
  }
  // Otherwise replace inline
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key.trim().split(".").reduce((acc: unknown, k) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
      return undefined;
    }, data);
    return val !== undefined ? String(val) : "";
  });
}

export function executeSet(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];
  const output = { ...$input };
  for (const { key, value } of mappings) {
    output[key] = interpolate(value, $input);
  }
  return output;
}
