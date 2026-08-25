import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const r = _interpolate(template, data as Record<string, unknown>);
  return r !== undefined && r !== null ? String(r) : "";
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
