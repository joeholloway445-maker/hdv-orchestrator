interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce(
        (obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined),
        data,
      );
    return val !== undefined ? String(val) : "";
  });
}

export function executeRespond(node: NodeDef, $input: Record<string, unknown>): unknown {
  const statusCode = parseInt(String(node.data?.statusCode || "200"), 10);
  const rawBody = node.data?.responseBody ? String(node.data.responseBody) : "";
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(interpolate(rawBody, $input)) : $input;
  } catch {
    body = interpolate(rawBody, $input);
  }
  return { ...$input, _webhookResponse: { statusCode, body } };
}
