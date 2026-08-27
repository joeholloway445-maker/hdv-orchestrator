/** Deterministic offline stub — always works with no network. */
import { emptyUsage, type CompleteOptions, type CompletionResult, type LlmProvider } from "./types.js";

export class StubProvider implements LlmProvider {
  readonly name = "stub";
  readonly model = "stub";

  async complete(prompt: string, _opts: CompleteOptions = {}): Promise<CompletionResult> {
    return {
      text: `[STUB] No LLM provider configured. Prompt was: ${prompt.slice(0, 80)}`,
      model: this.model,
      usage: emptyUsage(),
    };
  }
}
