import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const result = _interpolate(template, data as Record<string, unknown>);
  return result !== undefined && result !== null ? String(result) : "";
}

// OpenAI-compatible response shape
interface OAIResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: Record<string, unknown>;
}

export async function executeAI(node: NodeDef, $input: Record<string, unknown>): Promise<unknown> {
  const baseUrl = String(
    node.data?.baseUrl || process.env.AI_BASE_URL || "http://localhost:11434"
  ).replace(/\/$/, "");
  // API key is optional — Ollama and many local runtimes don't require one
  const apiKey = String(node.data?.apiKey || process.env.AI_API_KEY || "ollama");

  const model = String(node.data?.model || process.env.AI_MODEL || "llama3.2");

  const systemPrompt = node.data?.systemPrompt ? interpolate(String(node.data.systemPrompt), $input) : "";
  const userPrompt = node.data?.userPrompt ? interpolate(String(node.data.userPrompt), $input) : JSON.stringify($input);
  const maxTokens = parseInt(String(node.data?.maxTokens || "1024"), 10);
  const temperature = parseFloat(String(node.data?.temperature ?? "0.7"));

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: Math.max(0, Math.min(2, isNaN(temperature) ? 0.7 : temperature)),
      stream: false,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI node: API error ${resp.status} — ${errText}`);
  }

  const result = (await resp.json()) as OAIResponse;
  const text = result.choices?.[0]?.message?.content ?? "";

  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {}

  return {
    ...$input,
    aiText: text,
    aiResult: parsed,
    aiModel: model,
    aiUsage: result.usage,
  };
}
