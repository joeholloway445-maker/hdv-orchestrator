interface NodeDef {
  data: Record<string, unknown>;
}

export function executeSwitch(node: NodeDef, $input: Record<string, unknown>): unknown {
  const field = String(node.data?.field || "");
  const cases = (node.data?.cases as Array<{ value: string; output: string }>) || [];
  const defaultOutput = String(node.data?.defaultOutput || "default");

  const value = field
    .split(".")
    .reduce(
      (o: unknown, k: string) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
      $input as unknown,
    );

  const matched = cases.find((c) => String(c.value) === String(value ?? ""));
  return { ...$input, _switch: matched ? matched.output : defaultOutput };
}
