/**
 * OpenAI-compatible chat provider built on fetch.
 * Works with Ollama, vLLM, LM Studio, Groq, Together AI, etc.
 * No vendor SDK — zero extra packages.
 */
import { emptyUsage, type CompleteOptions, type CompletionDelta, type CompletionResult, type LlmProvider } from "./types.js";

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  chatPath?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

export class OpenAiCompatibleError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
    this.name = "OpenAiCompatibleError";
  }
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai_compatible";
  readonly model: string;
  private readonly url: string;
  private readonly maxTokens?: number;
  private readonly temperature: number;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: OpenAiCompatibleOptions) {
    if (!opts.baseUrl) throw new Error("OpenAiCompatibleProvider requires baseUrl");
    if (!opts.model) throw new Error("OpenAiCompatibleProvider requires model");
    const base = opts.baseUrl.replace(/\/+$/, "");
    const path = opts.chatPath ?? "/chat/completions";
    this.url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    Object.defineProperty(this, "apiKey", { value: opts.apiKey, enumerable: false, writable: false, configurable: false });
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature ?? 0.2;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.extraHeaders = opts.headers ?? {};
  }

  private get apiKey(): string | undefined { return undefined; }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json", ...this.extraHeaders };
    const key = (this as unknown as { apiKey?: string }).apiKey;
    if (key) h.authorization = `Bearer ${key}`;
    return h;
  }

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<CompletionResult> {
    const model = opts.model ?? this.model;
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });

    const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? this.temperature };
    const maxTokens = opts.maxTokens ?? this.maxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    if (opts.stop?.length) body.stop = opts.stop;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(this.url, { method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body), signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new OpenAiCompatibleError(`Request to ${this.url} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(timer);

    const raw = await resp.text();
    if (!resp.ok) throw new OpenAiCompatibleError(`HTTP ${resp.status}`, resp.status, raw);

    let parsed: ChatResponse;
    try { parsed = JSON.parse(raw) as ChatResponse; }
    catch { throw new OpenAiCompatibleError("Response not valid JSON", resp.status, raw); }

    const text = parsed.choices?.[0]?.message?.content ?? "";
    if (!text) throw new OpenAiCompatibleError("Empty completion", resp.status, raw);

    const u = parsed.usage;
    return {
      text: text.trim(),
      model: parsed.model ?? model,
      usage: u
        ? { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0 }
        : emptyUsage(),
    };
  }

  async *completeStream(prompt: string, opts: CompleteOptions = {}): AsyncIterable<CompletionDelta> {
    const model = opts.model ?? this.model;
    const messages: ChatMessage[] = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });

    const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? this.temperature, stream: true };
    const maxTokens = opts.maxTokens ?? this.maxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;

    const resp = await fetch(this.url, { method: "POST", headers: { ...this.buildHeaders(), accept: "text/event-stream" }, body: JSON.stringify(body) });
    if (!resp.ok) { const raw = await resp.text(); throw new OpenAiCompatibleError(`HTTP ${resp.status}`, resp.status, raw); }
    if (!resp.body) throw new OpenAiCompatibleError("No response body for stream");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value) buf += decoder.decode(value, { stream: true });
        if (done) { buf += decoder.decode(); }
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") { if (data === "[DONE]") return; continue; }
          try {
            const chunk = JSON.parse(data) as StreamChunk;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) yield { delta };
          } catch { /* tolerate malformed SSE frames */ }
        }
        if (done) return;
      }
    } finally { reader.releaseLock(); }
  }

  toJSON() { return { name: this.name, model: this.model, url: this.url }; }
}
