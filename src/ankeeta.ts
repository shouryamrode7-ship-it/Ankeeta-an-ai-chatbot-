import { log, errMessage } from "./logger.js";
import type { ConversationStore } from "./memory/index.js";
import { FALLBACK_REPLY, MAX_TOKENS, buildSystemPrompt, isGreetingOnly } from "./persona.js";
import type { Channel, ChatMessage, LLMClient } from "./types.js";

/** Instagram DMs are limited to 1000 characters; keep a margin. */
const MAX_REPLY_CHARS: Record<Channel, number> = { instagram: 900, whatsapp: 1500, web: 1500, linkedin: 3000 };
/** Hidden first turn that records "the chat was opened" so the greeting has a user turn before it. */
export const CHAT_OPENED_MARKER = "(chat opened)";
/** Guard against someone pasting a novel into the chat. */
const MAX_INPUT_CHARS = 4000;

export interface ReplyOptions {
  platform: Channel;
  userId: string;
  text: string;
  channel: Channel;
  /**
   * Optional thread context (e.g. pasted LinkedIn thread). Only used to seed a
   * conversation that has no stored history yet.
   */
  seedHistory?: ChatMessage[];
  /** Persist the exchange to memory (default true). */
  remember?: boolean;
}

export interface ReplyResult {
  reply: string;
  /** True when the LLM failed and a canned fallback was returned instead. */
  usedFallback: boolean;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export class Ankeeta {
  constructor(
    private readonly llm: LLMClient,
    private readonly store: ConversationStore,
    private readonly options: { greeting?: string } = {},
  ) {}

  /** The configured opening line, or undefined when disabled. */
  get openingGreeting(): string | undefined {
    return this.options.greeting?.trim() || undefined;
  }

  /**
   * Starts (or resumes) a chat and returns what to show. A new chat gets the opening greeting,
   * stored behind a hidden marker message so Ankeeta remembers having said it.
   */
  async openChat(platform: Channel, userId: string): Promise<ChatMessage[]> {
    const history = await this.store.getHistory(platform, userId);
    if (history.length > 0) return history.filter((m) => m.content !== CHAT_OPENED_MARKER);
    const greeting = this.openingGreeting;
    if (!greeting) return [];
    await this.store.append(platform, userId, [
      { role: "user", content: CHAT_OPENED_MARKER },
      { role: "assistant", content: greeting },
    ]);
    return [{ role: "assistant", content: greeting }];
  }

  /** Throws if the LLM fails – use `replySafe` when a reply must always be produced. */
  async reply(opts: ReplyOptions): Promise<string> {
    const text = clip(opts.text.trim(), MAX_INPUT_CHARS);
    const stored = await this.store.getHistory(opts.platform, opts.userId);
    const history = stored.length > 0 ? stored : (opts.seedHistory ?? []);

    // A brand-new chat that opens with just "hi" gets Ankeeta's signature greeting (no LLM call).
    const greeting = this.openingGreeting;
    if (greeting && history.length === 0 && isGreetingOnly(text)) {
      if (opts.remember !== false) {
        await this.store.append(opts.platform, opts.userId, [
          { role: "user", content: text },
          { role: "assistant", content: greeting },
        ]);
      }
      return greeting;
    }

    const raw = await this.llm.complete({
      system: buildSystemPrompt(opts.channel),
      messages: [...history, { role: "user", content: text }],
      channel: opts.channel,
      maxTokens: MAX_TOKENS[opts.channel],
    });

    const reply = clip(raw.trim(), MAX_REPLY_CHARS[opts.channel]);
    if (opts.remember !== false) {
      await this.store.append(opts.platform, opts.userId, [
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ]);
    }
    return reply;
  }

  /** Never throws: on LLM failure returns a friendly canned line and does not store it. */
  async replySafe(opts: ReplyOptions): Promise<ReplyResult> {
    try {
      return { reply: await this.reply(opts), usedFallback: false };
    } catch (err) {
      log.error("llm reply failed", { platform: opts.platform, error: errMessage(err) });
      return { reply: FALLBACK_REPLY[opts.channel], usedFallback: true };
    }
  }
}
