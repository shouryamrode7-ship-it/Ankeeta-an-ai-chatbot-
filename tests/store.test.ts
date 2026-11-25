import { describe, expect, it } from "vitest";
import { InstagramGraphSender } from "../src/instagram/graph.js";
import { loadConfig } from "../src/config.js";
import { RedisStore, type RedisLike } from "../src/memory/redis.js";
import { SqliteStore } from "../src/memory/sqlite.js";
import type { ConversationStore } from "../src/memory/store.js";
import { baseEnv } from "./helpers.js";

/** Minimal in-memory fake of the Redis commands RedisStore uses. */
function fakeRedis(): RedisLike {
  const lists = new Map<string, string[]>();
  const strings = new Set<string>();
  return {
    async rPush(key, value) {
      const l = lists.get(key) ?? [];
      l.push(...(Array.isArray(value) ? value : [value]));
      lists.set(key, l);
      return l.length;
    },
    async lTrim(key, start) {
      const l = lists.get(key) ?? [];
      lists.set(key, start < 0 ? l.slice(Math.max(0, l.length + start)) : l.slice(start));
      return "OK";
    },
    async lRange(key, start) {
      const l = lists.get(key) ?? [];
      return start < 0 ? l.slice(Math.max(0, l.length + start)) : l.slice(start);
    },
    async expire() {
      return 1;
    },
    async set(key, _v, opts) {
      if (opts.NX && strings.has(key)) return null;
      strings.add(key);
      return "OK";
    },
  };
}

const stores: Array<[string, () => ConversationStore]> = [
  ["SqliteStore", () => new SqliteStore(":memory:", 15)],
  ["RedisStore", () => new RedisStore(fakeRedis(), 15)],
];

describe.each(stores)("%s", (_name, make) => {
  it("returns history oldest-first and trims to the last 15", async () => {
    const s = make();
    for (let i = 1; i <= 20; i++) await s.append("instagram", "u", [{ role: i % 2 ? "user" : "assistant", content: `m${i}` }]);
    const h = await s.getHistory("instagram", "u");
    expect(h).toHaveLength(15);
    expect(h[0]?.content).toBe("m6");
    expect(h.at(-1)?.content).toBe("m20");
  });

  it("isolates (platform, user) pairs", async () => {
    const s = make();
    await s.append("instagram", "a", [{ role: "user", content: "ig-a" }]);
    await s.append("linkedin", "a", [{ role: "user", content: "li-a" }]);
    await s.append("instagram", "b", [{ role: "user", content: "ig-b" }]);
    expect(await s.getHistory("instagram", "a")).toEqual([{ role: "user", content: "ig-a" }]);
    expect(await s.getHistory("linkedin", "a")).toEqual([{ role: "user", content: "li-a" }]);
    expect(await s.getHistory("instagram", "zzz")).toEqual([]);
  });

  it("markEventSeen is true once, then false", async () => {
    const s = make();
    expect(await s.markEventSeen("e1")).toBe(true);
    expect(await s.markEventSeen("e1")).toBe(false);
    expect(await s.markEventSeen("e2")).toBe(true);
  });
});

describe("InstagramGraphSender", () => {
  it("POSTs the recipient and text with a bearer token", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Response.json({ message_id: "x" });
    }) as unknown as typeof fetch;
    const cfg = loadConfig(baseEnv).instagram;
    await new InstagramGraphSender(cfg, fetchMock).sendText("user-9", "hello");

    expect(calls[0]?.[0]).toBe("https://graph.instagram.com/v23.0/me/messages");
    expect((calls[0]?.[1].headers as Record<string, string>).authorization).toBe("Bearer ig-token");
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual({ recipient: { id: "user-9" }, message: { text: "hello" } });
  });

  it("throws on a non-2xx response", async () => {
    const cfg = loadConfig(baseEnv).instagram;
    const sender = new InstagramGraphSender(cfg, (async () => new Response("nope", { status: 400 })) as typeof fetch);
    await expect(sender.sendText("u", "x")).rejects.toThrow(/400/);
  });
});
