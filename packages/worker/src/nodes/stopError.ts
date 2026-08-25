interface NodeDef {
  data: Record<string, unknown>;
}

export function executeStopError(node: NodeDef, $input: Record<string, unknown>): never {
  const message = String(node.data?.message || "Workflow stopped with error");
  const includeInput = !!node.data?.includeInput;
  const fullMsg = includeInput ? `${message} — input: ${JSON.stringify($input)}` : message;
  throw new Error(fullMsg);
}
