interface NodeDef {
  data: Record<string, unknown>;
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path || path === "$") return obj;
  const clean = path.replace(/^\$\.?/, "");
  const parts = clean.split(/\.(?![^\[]*\])/).filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    const arrMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch) {
      cur = (cur as Record<string, unknown>)[arrMatch[1]];
      if (Array.isArray(cur)) cur = (cur as unknown[])[parseInt(arrMatch[2], 10)];
      else return undefined;
    } else {
      cur = (cur as Record<string, unknown>)[part];
    }
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cur) || typeof cur[p] !== "object" || cur[p] === null) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function executeJsonPath(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const operation = String(node.data?.operation || "get");

  if (operation === "get") {
    const path = String(node.data?.path || "");
    const outputField = String(node.data?.outputField || "value");
    const value = getByPath($input, path);
    return { ...$input, [outputField]: value };
  }

  if (operation === "set") {
    const path = String(node.data?.path || "");
    const value = node.data?.value;
    const result = { ...$input };
    setByPath(result, path, value);
    return result;
  }

  if (operation === "delete") {
    const path = String(node.data?.path || "");
    const result = { ...$input };
    const parts = path.split(".").filter(Boolean);
    if (parts.length === 1) {
      delete result[parts[0]];
    } else {
      let cur: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur[parts[i]] as Record<string, unknown>;
        if (!cur) break;
      }
      if (cur) delete cur[parts[parts.length - 1]];
    }
    return result;
  }

  if (operation === "pick") {
    const paths = String(node.data?.paths || "").split(",").map((s) => s.trim()).filter(Boolean);
    const result: Record<string, unknown> = {};
    for (const p of paths) {
      const val = getByPath($input, p);
      const key = p.split(".").pop() || p;
      result[key] = val;
    }
    return result;
  }

  if (operation === "omit") {
    const paths = String(node.data?.paths || "").split(",").map((s) => s.trim()).filter(Boolean);
    const result = { ...$input };
    for (const p of paths) {
      const parts = p.split(".").filter(Boolean);
      if (parts.length === 1) { delete result[parts[0]]; continue; }
      let cur: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] as Record<string, unknown>;
      if (cur) delete cur[parts[parts.length - 1]];
    }
    return result;
  }

  if (operation === "rename") {
    const from = String(node.data?.from || "");
    const to = String(node.data?.to || "");
    const result = { ...$input };
    if (from && to && from in result) {
      result[to] = result[from];
      delete result[from];
    }
    return result;
  }

  return $input;
}
