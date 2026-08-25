interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key: string) => {
    const val = key
      .trim()
      .split(".")
      .reduce(
        (obj: unknown, k: string) =>
          obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined,
        data,
      );
    return val !== undefined ? String(val) : "";
  });
}

export async function executeAI(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const apiKey = String(node.data?.apiKey || process.env.ANTHROPIC_API_KEY || "");
  if (!apiKey) throw new Error("AI node: no API key configured (set apiKey in node or ANTHROPIC_API_KEY env var)");

  const model = String(node.data?.model || "claude-haiku-4-5-20251001");
  const systemPrompt = node.data?.systemPrompt ? interpolate(String(node.data.systemPrompt), $input) : "";
  const userPrompt = node.data?.userPrompt ? interpolate(String(node.data.userPrompt), $input) : JSON.stringify($input);
  const maxTokens = parseInt(String(node.data?.maxTokens || "1024"), 10);
  const temperature = parseFloat(String(node.data?.temperature ?? "1"));

  const baseUrl = String(node.data?.baseUrl || "https://api.anthropic.com");

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (systemPrompt) body.system = systemPrompt;
  if (!isNaN(temperature)) body.temperature = Math.max(0, Math.min(1, temperature));

  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI node: API error ${resp.status} — ${errText}`);
  }

  const result = await resp.json() as { content: Array<{ type: string; text: string }>; usage?: unknown };
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";

  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {}

  return {
    ...$input,
    aiText: text,
    aiResult: parsed,
    aiModel: model,
    aiUsage: (result as any).usage,
  };
}
