import axios from "axios";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce((obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined), data);
    return val !== undefined ? String(val) : "";
  });
}

export async function executeHttpRequest(
  node: NodeDef,
  $input: unknown
): Promise<unknown> {
  const { method = "GET", url, headers = {}, body } = node.data as {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  if (!url) throw new Error("HTTP Request node: url is required");

  const resolvedUrl = interpolate(url, $input);
  const resolvedBody = body ? JSON.parse(interpolate(body, $input)) : undefined;

  const response = await axios({
    method,
    url: resolvedUrl,
    headers,
    data: resolvedBody,
    timeout: 30000,
  });

  return { status: response.status, headers: response.headers, body: response.data };
}
