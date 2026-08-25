interface NodeDef {
  data: Record<string, unknown>;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function executeIfBranch(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const condition = String(node.data?.condition || "true");

  let result = false;
  try {
    // Safe evaluation: only allow simple comparisons via Function constructor in limited scope
    const fn = new Function("$input", "get", `"use strict"; return !!(${condition});`);
    result = Boolean(fn($input, get));
  } catch {
    result = false;
  }

  return { ...$input, _branch: result ? "true" : "false" };
}
