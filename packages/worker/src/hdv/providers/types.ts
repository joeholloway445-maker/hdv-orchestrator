/** Token accounting for a single completion. */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompleteOptions {
  model?: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage: LlmUsage;
}

export interface CompletionDelta {
  delta: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(prompt: string, opts?: CompleteOptions): Promise<CompletionResult>;
  completeStream?(prompt: string, opts?: CompleteOptions): AsyncIterable<CompletionDelta>;
}

export type ProviderKind = "stub" | "openai_compatible";

export function emptyUsage(): LlmUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
