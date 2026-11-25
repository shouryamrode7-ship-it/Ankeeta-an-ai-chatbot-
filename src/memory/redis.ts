import type { ChatMessage } from "../types.js";
import type { ConversationStore } from "./store.js";

/** The subset of the node-redis client we use (also makes it trivial to fake in tests). */
export interface RedisLike {
  rPush(key: string, value: string | string[]): Promise<number>;
  lTrim(key: string, start: number, stop: number): Promise<string>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number | boolean>;
  set(key: string, value: string, options: { NX: true; EX: number }): Promise<string | null>;
  quit?(): Promise<unknown>;
}

const CONVERSATION_TTL_S = 60 * 60 * 24 * 30; // 30 days of inactivity
const SEEN_TTL_S = 60 * 60 * 24;

export class RedisStore implements ConversationStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly historyLimit: number,
  ) {}

  private key(platform: string, userId: string): string {
    return `ankeeta:conv:${platform}:${userId}`;
  }

  async getHistory(platform: string, userId: string): Promise<ChatMessage[]> {
    const raw = await this.redis.lRange(this.key(platform, userId), -this.historyLimit, -1);
    const out: ChatMessage[] = [];
    for (const item of raw) {
      try {
        out.push(JSON.parse(item) as ChatMessage);
      } catch {
        // skip corrupt entries
      }
    }
    return out;
  }

  async append(platform: string, userId: string, messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const key = this.key(platform, userId);
    await this.redis.rPush(key, messages.map((m) => JSON.stringify({ role: m.role, content: m.content })));
    await this.redis.lTrim(key, -this.historyLimit, -1);
    await this.redis.expire(key, CONVERSATION_TTL_S);
  }

  async markEventSeen(eventId: string): Promise<boolean> {
    const res = await this.redis.set(`ankeeta:seen:${eventId}`, "1", { NX: true, EX: SEEN_TTL_S });
    return res === "OK";
  }

  async close(): Promise<void> {
    await this.redis.quit?.();
  }
}

export async function createRedisStore(url: string, historyLimit: number): Promise<RedisStore> {
  const { createClient } = await import("redis");
  const client = createClient({ url });
  client.on("error", (err) => console.error(JSON.stringify({ level: "error", msg: "redis error", err: String(err) })));
  await client.connect();
  return new RedisStore(client as unknown as RedisLike, historyLimit);
}
