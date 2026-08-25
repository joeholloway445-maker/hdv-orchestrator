interface NodeDef {
  data: Record<string, unknown>;
}

export async function executeWait(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const ms = Math.min(parseInt(String(node.data?.duration || "1000"), 10), 300_000);
  await new Promise((r) => setTimeout(r, ms));
  return $input;
}
