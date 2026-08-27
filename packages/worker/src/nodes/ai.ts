import { PrismaClient } from "@prisma/client";
import { interpolate as _interpolate } from "../lib/expr";
import { tenantProviderConfig, type Tenant } from "../hdv/tenancy";

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

/**
 * Resolve provider config for a node execution.
 * Priority: node.data overrides > BYOK tenant config > platform env vars.
 * Falls back gracefully when tenantId is absent or prisma is not available.
 */
async function resolveProviderConfig(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
): Promise<{ baseUrl: string; apiKey: string; model: string }> {
  // Explicit node-level overrides always win
  if (node.data?.baseUrl && node.data?.apiKey) {
    return {
      baseUrl: String(node.data.baseUrl).replace(/\/$/, ""),
      apiKey: String(node.data.apiKey),
      model: String(node.data?.model || process.env.AI_MODEL || "llama3.2"),
    };
  }

  // Attempt BYOK tenant lookup when we have a tenantId and prisma
  const tenantId =
    String(node.data?.tenantId ?? "") ||
    String(($input.$tenant as Record<string, unknown> | undefined)?.id ?? "");

  if (tenantId && prisma) {
    try {
      // byokApiKey added in migration 20260827_byok_fields; cast until `prisma generate` reflects it
      const user = await (prisma.user.findFirst as Function)({
        where: { tenantId },
        select: { plan: true, byokBaseUrl: true, byokApiKey: true, byokModel: true },
      }) as { plan: string; byokBaseUrl: string | null; byokApiKey: string | null; byokModel: string | null } | null;
      if (user) {
        const tenant: Tenant = {
          id: tenantId,
          plan: user.plan as Tenant["plan"],
          byokBaseUrl: user.byokBaseUrl ?? undefined,
          byokApiKey: user.byokApiKey ?? undefined,
          byokModel: user.byokModel ?? undefined,
        };
        const cfg = tenantProviderConfig(tenant);
        return {
          baseUrl: cfg.baseUrl.replace(/\/$/, ""),
          apiKey: cfg.apiKey,
          model: String(node.data?.model || cfg.model),
        };
      }
    } catch (err) {
      // Tenant lookup failure is non-fatal — fall through to platform defaults
      console.warn("[ai node] Tenant lookup failed, using platform defaults:", err);
    }
  }

  // Platform defaults
  return {
    baseUrl: String(node.data?.baseUrl || process.env.AI_BASE_URL || "http://localhost:11434").replace(/\/$/, ""),
    apiKey: String(node.data?.apiKey || process.env.AI_API_KEY || "ollama"),
    model: String(node.data?.model || process.env.AI_MODEL || "llama3.2"),
  };
}

export async function executeAI(
  node: NodeDef,
  $input: Record<string, unknown>,
  prisma?: PrismaClient,
): Promise<unknown> {
  const { baseUrl, apiKey, model } = await resolveProviderConfig(node, $input, prisma);

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
