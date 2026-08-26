interface NodeDef {
  data: Record<string, unknown>;
}

interface Mapping {
  from: string;
  to: string;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cur[part] !== "object" || cur[part] === null) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteNestedKey(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cur[part] !== "object" || cur[part] === null) return;
    cur = cur[part] as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]];
}

export function executeRenameKeys(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const mappings = (node.data?.mappings as Mapping[] | undefined) || [];
  const removeOldKeys = node.data?.removeOldKeys !== false;

  const result = JSON.parse(JSON.stringify($input)) as Record<string, unknown>;

  for (const { from, to } of mappings) {
    if (!from || !to || from === to) continue;
    const value = getNestedValue(result, from);
    if (value !== undefined) {
      setNestedValue(result, to, value);
      if (removeOldKeys) {
        deleteNestedKey(result, from);
      }
    }
  }

  return result;
}
