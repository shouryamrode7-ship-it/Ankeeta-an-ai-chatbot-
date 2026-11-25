import type { Config } from "./config.js";
import type { ChatMessage, LLMClient, LLMRequest } from "./types.js";

type FetchLike = typeof fetch;

/**
 * Providers require a conversation that starts with a user turn and strictly
 * alternates roles. Our stored history can violate that (e.g. a failed reply
 * leaves two user messages in a row, or trimming cuts at an assistant turn),
 * so normalise it before every call.
 */
export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role: m.role, content });
    }
  }
  while (out[0] && out[0].role !== "user") out.shift();
  return out;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Temporary provider-side problems worth retrying (rate limit, overload, gateway errors). */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  retryDelaysMs: number[],
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let error: LLMError;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.json();
      // Keep error text short so logs stay small.
      const text = (await res.text().catch(() => "")).slice(0, 200);
      error = new LLMError(`LLM request failed with HTTP ${res.status}: ${text}`, res.status);
    } catch (err) {
      if (err instanceof LLMError) throw err;
      error = new LLMError(`LLM request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const retryable = error.status === undefined || RETRYABLE.has(error.status);
    const delay = retryDelaysMs[attempt];
    if (!retryable || delay === undefined) throw error;
    await sleep(delay);
  }
}

export class AnthropicClient implements LLMClient {
  constructor(
    private readonly cfg: Config["llm"],
    private readonly fetchImpl: FetchLike = fetch,
    private readonly retryDelaysMs: number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {}

  async complete(req: LLMRequest): Promise<string> {
    const messages = normalizeMessages(req.messages);
    if (messages.length === 0) throw new LLMError("No user message to respond to");

    const data = await postJson(
      this.fetchImpl,
      `${this.cfg.baseUrl}/v1/messages`,
      { "x-api-key": this.cfg.apiKey, "anthropic-version": "2023-06-01" },
      { model: this.cfg.model, max_tokens: req.maxTokens ?? 300, system: req.system, messages },
      this.cfg.timeoutMs,
      this.retryDelaysMs,
    );

    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b: any) => b?.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text)
          .join("")
          .trim()
      : "";
    if (!text) throw new LLMError("LLM returned an empty reply");
    return text;
  }
}

/** Any OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter, Ollama, ...). */
export class OpenAICompatibleClient implements LLMClient {
  constructor(
    private readonly cfg: Config["llm"],
    private readonly fetchImpl: FetchLike = fetch,
    private readonly retryDelaysMs: number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {}

  async complete(req: LLMRequest): Promise<string> {
    const messages = normalizeMessages(req.messages);
    if (messages.length === 0) throw new LLMError("No user message to respond to");

    const data = await postJson(
      this.fetchImpl,
      `${this.cfg.baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.cfg.apiKey}` },
      {
        model: this.cfg.model,
        max_tokens: req.maxTokens ?? 300,
        messages: [{ role: "system", content: req.system }, ...messages],
      },
      this.cfg.timeoutMs,
      this.retryDelaysMs,
    );

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new LLMError("LLM returned an empty reply");
    return text.trim();
  }
}

export function createLLMClient(cfg: Config["llm"], fetchImpl: FetchLike = fetch): LLMClient {
  if (!cfg.apiKey) {
    // Fail at call time (not boot) so /health and the redirect links still work
    // while the operator is finishing configuration.
    return {
      complete: async () => {
        throw new LLMError("LLM_API_KEY is not configured");
      },
    };
  }
  return cfg.provider === "openai" ? new OpenAICompatibleClient(cfg, fetchImpl) : new AnthropicClient(cfg, fetchImpl);
}
