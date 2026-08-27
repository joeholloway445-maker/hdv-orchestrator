/**
 * Build an LlmProvider from environment variables.
 * Falls back to the offline StubProvider when no endpoint is configured.
 */
import { OpenAiCompatibleProvider } from "./openai_compatible.js";
import { StubProvider } from "./stub.js";
import type { LlmProvider } from "./types.js";

export interface ProviderEnv {
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
}

export function buildProvider(env: ProviderEnv = process.env): LlmProvider {
  const baseUrl = env.AI_BASE_URL?.trim();
  const model = (env.AI_MODEL?.trim()) || "llama3.2";
  const apiKey = env.AI_API_KEY?.trim() || "ollama";

  if (!baseUrl) return new StubProvider();

  return new OpenAiCompatibleProvider({ baseUrl, apiKey, model });
}

/** Singleton for the worker process. */
export const globalProvider: LlmProvider = buildProvider();
