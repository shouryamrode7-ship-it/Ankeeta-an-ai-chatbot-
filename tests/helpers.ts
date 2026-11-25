import { vi } from "vitest";
import { Ankeeta } from "../src/ankeeta.js";
import { createApp } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import type { InstagramSender } from "../src/instagram/graph.js";
import type { WhatsAppSender } from "../src/whatsapp/graph.js";
import type { LinkedInPartnerAdapter } from "../src/linkedin/partnerAdapter.js";
import { SqliteStore } from "../src/memory/sqlite.js";
import { BackgroundQueue } from "../src/queue.js";
import type { LLMClient, LLMRequest } from "../src/types.js";

export const SECRET = "test-app-secret";
export const VERIFY = "test-verify-token";
export const ADMIN = "test-admin-key";

export const baseEnv = {
  INSTAGRAM_USERNAME: "ankeeta.ai",
  INSTAGRAM_VERIFY_TOKEN: VERIFY,
  INSTAGRAM_ACCESS_TOKEN: "ig-token",
  INSTAGRAM_APP_SECRET: SECRET,
  LLM_API_KEY: "llm-key",
  LLM_MODEL: "test-model",
  ADMIN_API_KEY: ADMIN,
  WHATSAPP_ALLOWED_NUMBERS: "+91 98000-00001",
  WHATSAPP_VERIFY_TOKEN: "wa-verify",
  WHATSAPP_ACCESS_TOKEN: "wa-token",
  WHATSAPP_PHONE_NUMBER_ID: "10555",
};

/** Records every request and answers with a canned, channel-aware reply. */
export class MockLLM implements LLMClient {
  calls: LLMRequest[] = [];
  failNext = false;

  async complete(req: LLMRequest): Promise<string> {
    this.calls.push(structuredClone(req));
    if (this.failNext) {
      this.failNext = false;
      throw new Error("boom");
    }
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    if (req.channel === "instagram") return `hey! 😊 you said: ${last}`;
    if (req.channel === "whatsapp") return `hi there 🙂 you said: ${last}`;
    return `Thanks for sharing. You said: ${last}`;
  }
}

export function makeHarness(env: Record<string, string | undefined> = baseEnv, opts: { linkedinAdapter?: LinkedInPartnerAdapter; greeting?: string } = {}) {
  const config: Config = loadConfig(env);
  const llm = new MockLLM();
  const store = new SqliteStore(":memory:", config.memory.historyLimit);
  const queue = new BackgroundQueue();
  const ankeeta = new Ankeeta(llm, store, opts.greeting ? { greeting: opts.greeting } : {});
  const sent: Array<{ to: string; text: string }> = [];
  const instagramSender: InstagramSender = {
    sendText: vi.fn(async (to: string, text: string) => {
      sent.push({ to, text });
    }),
  };
  const waSent: Array<{ to: string; text: string }> = [];
  const whatsappSender: WhatsAppSender = {
    sendText: vi.fn(async (to: string, text: string) => {
      waSent.push({ to, text });
    }),
  };
  const app = createApp({ config, ankeeta, store, queue, instagramSender, whatsappSender, ...(opts.linkedinAdapter ? { linkedinAdapter: opts.linkedinAdapter } : {}) });
  return { app, config, llm, store, queue, ankeeta, sent, instagramSender, waSent, whatsappSender };
}

export function igPayload(
  events: Array<{ sender: string; text?: string; mid?: string; echo?: boolean }>,
  accountId = "17841400000000000",
) {
  return {
    object: "instagram",
    entry: [
      {
        id: accountId,
        time: Date.now(),
        messaging: events.map((e) => ({
          sender: { id: e.sender },
          recipient: { id: accountId },
          timestamp: Date.now(),
          message: {
            mid: e.mid ?? `mid-${Math.random().toString(36).slice(2)}`,
            ...(e.text !== undefined ? { text: e.text } : {}),
            ...(e.echo ? { is_echo: true } : {}),
          },
        })),
      },
    ],
  };
}

export function waPayload(messages: Array<{ from: string; text?: string; id?: string; type?: string }>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "10555" },
              messages: messages.map((m) => ({
                from: m.from,
                id: m.id ?? `wamid.${Math.random().toString(36).slice(2)}`,
                type: m.type ?? "text",
                ...(m.text !== undefined ? { text: { body: m.text } } : {}),
              })),
            },
          },
        ],
      },
    ],
  };
}
