/**
 * APEX dispatch node — routes a task through the HDV Mixture-of-Experts router.
 *
 * APEX selects the best expert model for the task intent based on:
 *   - Task category (code, creative, analysis, security, vision, etc.)
 *   - Cost envelope (budget_tier: low | medium | high)
 *   - Latency preference (prefer_speed: true | false)
 *
 * Uses any OpenAI-compatible inference endpoint (Ollama, vLLM, LM Studio, etc.)
 * configured via AI_BASE_URL + AI_MODEL env vars. No paid API required.
 */
import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const r = _interpolate(template, data as Record<string, unknown>);
  return r !== undefined && r !== null ? String(r) : "";
}

interface OAIResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: Record<string, unknown>;
}

/** Hard-coded MoE heuristic — maps task intent to an open model name. */
function heuristicRoute(intent: string, category: string, budgetTier: string): string {
  const defaultModel = process.env.AI_MODEL || "llama3.2";
  const fastModel = process.env.AI_MODEL_FAST || process.env.AI_MODEL || "llama3.2";
  const powerModel = process.env.AI_MODEL_POWER || process.env.AI_MODEL || "llama3.2";

  const low = budgetTier === "low";
  const high = budgetTier === "high";

  switch (category) {
    case "security":
    case "audit":
      return high ? powerModel : defaultModel;
    case "code":
    case "analysis":
      return low ? fastModel : high ? powerModel : defaultModel;
    case "creative":
    case "simulation":
      return high ? powerModel : defaultModel;
    case "vision":
    case "multimodal":
      return process.env.AI_MODEL_VISION || defaultModel;
    case "chat":
    case "support":
      return low ? fastModel : defaultModel;
    default: {
      const lower = intent.toLowerCase();
      if (lower.includes("secur") || lower.includes("audit") || lower.includes("knoll")) return powerModel;
      if (lower.includes("dream") || lower.includes("simulat") || lower.includes("creat")) return defaultModel;
      if (lower.includes("cod") || lower.includes("debug") || lower.includes("refactor")) return defaultModel;
      return low ? fastModel : defaultModel;
    }
  }
}

export interface ApexDispatchResult {
  apexModel: string;
  apexCategory: string;
  apexBudgetTier: string;
  apexResponseText: string;
  apexResponseParsed: unknown;
  apexRoutedLocally: boolean;
  apexUsage?: unknown;
  _gpuListingUrl?: string;
}

/** Fetches the cheapest active GPU listing from the marketplace. */
async function fetchCheapestGpuListing(): Promise<{ endpointUrl: string; apiKeyHash: string | null } | null> {
  const apiUrl = process.env.WORKFLOW_API_URL || "http://localhost:4000";
  const apiKey = process.env.WORKFLOW_API_KEY || "";
  try {
    const resp = await fetch(`${apiUrl}/gpu`, {
      headers: { "x-workflow-api-key": apiKey },
    });
    if (!resp.ok) return null;
    const listings = await resp.json() as Array<{ endpointUrl: string; apiKeyHash?: string; ratePerHour: number; status: string }>;
    const active = listings.filter((l) => l.status === "ACTIVE");
    if (active.length === 0) return null;
    active.sort((a, b) => a.ratePerHour - b.ratePerHour);
    return { endpointUrl: active[0].endpointUrl, apiKeyHash: active[0].apiKeyHash ?? null };
  } catch {
    return null;
  }
}

export async function executeApexDispatch(
  node: NodeDef,
  $input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const intent = node.data?.intent ? interpolate(String(node.data.intent), $input) : JSON.stringify($input);
  const category = String(node.data?.category || "general");
  const budgetTier = String(node.data?.budgetTier || "medium");
  const preferSpeed = node.data?.preferSpeed === true || node.data?.preferSpeed === "true";
  const systemPrompt = node.data?.systemPrompt ? interpolate(String(node.data.systemPrompt), $input) : "";
  const maxTokens = parseInt(String(node.data?.maxTokens || "1024"), 10);
  const gpuBurst = node.data?.gpuBurst === true || node.data?.gpuBurst === "true";

  const apexBaseUrl = process.env.APEX_BASE_URL?.replace(/\/$/, "");
  let chosenModel: string;
  let routedLocally = false;

  // Try APEX MoE endpoint first
  if (apexBaseUrl) {
    try {
      const routeResp = await fetch(`${apexBaseUrl}/route`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.APEX_API_KEY ? { Authorization: `Bearer ${process.env.APEX_API_KEY}` } : {}),
        },
        body: JSON.stringify({ intent, category, budgetTier, preferSpeed }),
        signal: AbortSignal.timeout(5000),
      });
      if (routeResp.ok) {
        const routeData = (await routeResp.json()) as { model?: string };
        chosenModel = routeData.model ?? heuristicRoute(intent, category, budgetTier);
      } else {
        chosenModel = heuristicRoute(intent, category, budgetTier);
        routedLocally = true;
      }
    } catch {
      chosenModel = heuristicRoute(intent, category, budgetTier);
      routedLocally = true;
    }
  } else {
    chosenModel = heuristicRoute(intent, category, budgetTier);
    routedLocally = true;
  }

  // GPU burst: route image/video generation to the cheapest marketplace GPU listing
  let gpuListingUrl: string | undefined;
  let baseUrl: string;
  let apiKey: string;

  if (gpuBurst) {
    const listing = await fetchCheapestGpuListing();
    if (listing) {
      // Use the marketplace listing endpoint; the real per-listing key is retrieved
      // via APEX_GPU_API_KEY (placeholder until the key escrow system is built).
      baseUrl = listing.endpointUrl.replace(/\/$/, "");
      apiKey = process.env.APEX_GPU_API_KEY || "gpu-placeholder";
      gpuListingUrl = listing.endpointUrl;
    } else {
      // No active GPU listing — fall back to the default provider silently
      baseUrl = String(node.data?.baseUrl || process.env.AI_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
      apiKey = String(node.data?.apiKey || process.env.AI_API_KEY || "ollama");
    }
  } else {
    // Standard path: use the configured OpenAI-compatible inference endpoint
    baseUrl = String(node.data?.baseUrl || process.env.AI_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    apiKey = String(node.data?.apiKey || process.env.AI_API_KEY || "ollama");
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: intent });

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: chosenModel,
      messages,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`APEX node: model API error ${resp.status} — ${errText}`);
  }

  const result = (await resp.json()) as OAIResponse;
  const text = result.choices?.[0]?.message?.content ?? "";

  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch {}

  return {
    ...$input,
    apexModel: chosenModel,
    apexCategory: category,
    apexBudgetTier: budgetTier,
    apexResponseText: text,
    apexResponseParsed: parsed,
    apexRoutedLocally: routedLocally,
    apexUsage: (result as unknown as Record<string, unknown>).usage,
    ...(gpuListingUrl !== undefined ? { _gpuListingUrl: gpuListingUrl } : {}),
  };
}
