interface NodeDef {
  data: Record<string, unknown>;
}

export function executeLoop(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const arrayKey = String(node.data?.arrayKey || "items");
  const arr = Array.isArray($input[arrayKey]) ? ($input[arrayKey] as unknown[]) : [];

  // Apply a simple inline transform if configured (field mapping only)
  const mappings = (node.data?.mappings as Array<{ key: string; value: string }>) || [];

  const processed = arr.map((item) => {
    if (mappings.length === 0) return item;
    const obj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : { value: item };
    const out: Record<string, unknown> = { ...obj };
    for (const { key, value } of mappings) {
      // simple interpolation: {{field}} from each item
      out[key] = value.replace(/\{\{(.+?)\}\}/g, (_: string, k: string) => {
        const v = k.trim().split(".").reduce((acc: unknown, seg) => {
          if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[seg];
          return undefined;
        }, obj);
        return v !== undefined ? String(v) : "";
      });
    }
    return out;
  });

  return { ...$input, [arrayKey]: processed, _loopCount: processed.length };
}
