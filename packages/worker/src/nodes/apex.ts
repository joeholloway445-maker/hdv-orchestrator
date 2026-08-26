/**
 * APEX dispatch node — routes a task through the HDV Mixture-of-Experts router.
 *
 * APEX selects the best expert model for the task intent based on:
 *   - Task category (code, creative, analysis, security, vision, etc.)
 *   - Cost envelope (budget_tier: low | medium | high)
 *   - Latency preference (prefer_speed: true | false)
 *
 * The node calls the APEX MoE endpoint (APEX_BASE_URL) or falls back to a
 * built-in heuristic router when the endpoint is unavailable.
 */
import { interpolate as _interpolate } from "../lib/expr";

interface NodeDef {
  data: Record<string, unknown>;
}

function interpolate(template: string, data: unknown): string {
  const r = _interpolate(template, data as Record<string, unknown>);
  return r !== undefined && r !== null ? String(r) : "";
}

/** Hard-coded MoE heuristic when APEX_BASE_URL is not configured. */
function heuristicRoute(intent: string, category: string, budgetTier: string): string {
  const low = budgetTier === "low";
  const high = budgetTier === "high";
  switch (category) {
    case "security":
    case "audit":
      return high ? "claude-opus-5" : "claude-sonnet-5";
    case "code":
    case "analysis":
      return low ? "claude-haiku-4-5-20251001" : high ? "claude-opus-5" : "claude-sonnet-5";
    case "creative":
    case "simulation":
      return high ? "claude-fable-5" : "claude-sonnet-5";
    case "vision":
    case "multimodal":
      return "claude-sonnet-5";
    case "chat":
    case "support":
      return low ? "claude-haiku-4-5-20251001" : "claude-sonnet-5";
    default: {
      // Keyword sniffing on intent
      const lower = intent.toLowerCase();
      if (lower.includes("secur") || lower.includes("audit") || lower.includes("knoll")) return "claude-opus-5";
      if (lower.includes("dream") || lower.includes("simulat") || lower.includes("creat")) return "claude-fable-5";
      if (lower.includes("cod") || lower.includes("debug") || lower.includes("refactor")) return "claude-sonnet-5";
      return low ? "claude-haiku-4-5-20251001" : "claude-sonnet-5";
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

  // Execute with chosen model via Anthropic API
  const apiKey = String(node.data?.apiKey || process.env.ANTHROPIC_API_KEY || "");
  if (!apiKey) throw new Error("APEX node: no API key (set ANTHROPIC_API_KEY or apiKey in node)");

  const body: Record<string, unknown> = {
    model: chosenModel,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: intent }],
  };
  if (systemPrompt) body.system = systemPrompt;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
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
    throw new Error(`APEX node: model API error ${resp.status} — ${errText}`);
  }

  const result = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
    usage?: unknown;
  };
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";

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
    apexUsage: (result as Record<string, unknown>).usage,
  };
}
