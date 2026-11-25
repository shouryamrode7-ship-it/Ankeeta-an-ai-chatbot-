import { describe, expect, it, vi } from "vitest";
import { Ankeeta } from "../src/ankeeta.js";
import { loadConfig } from "../src/config.js";
import { AnthropicClient, LLMError, OpenAICompatibleClient, createLLMClient, normalizeMessages } from "../src/llm.js";
import { buildSystemPrompt } from "../src/persona.js";
import { SqliteStore } from "../src/memory/sqlite.js";
import { MockLLM, baseEnv } from "./helpers.js";

describe("persona", () => {
  it("instagram prompt asks for short, playful, mobile-friendly replies with occasional emoji", () => {
    const p = buildSystemPrompt("instagram");
    expect(p).toContain("Channel: instagram");
    expect(p).toContain("1–3 short sentences");
    expect(p).toMatch(/occasional natural emoji/);
  });

  it("linkedin prompt asks for polished, warm tone without slang or emojis", () => {
    const p = buildSystemPrompt("linkedin");
    expect(p).toContain("Channel: linkedin");
    expect(p).toContain("slightly more polished");
    expect(p).toContain("No heavy slang and no emojis");
    expect(p).not.toContain("Channel: instagram");
  });

  it.each(["instagram", "linkedin"] as const)("%s prompt contains every guardrail", (channel) => {
    const p = buildSystemPrompt(channel);
    expect(p).toMatch(/You are an AI/);
    expect(p).toMatch(/Never promote, sell or recommend/);
    expect(p).toMatch(/medical, legal, or financial advice/);
    expect(p).toMatch(/respectful and safe/);
  });
});

describe("Ankeeta reply service (mock LLM)", () => {
  it("generates channel-specific replies and passes channel metadata", async () => {
    const llm = new MockLLM();
    const bot = new Ankeeta(llm, new SqliteStore(":memory:", 15));
    const ig = await bot.reply({ platform: "instagram", userId: "u", text: "hi", channel: "instagram" });
    const li = await bot.reply({ platform: "linkedin", userId: "u", text: "hi", channel: "linkedin" });
    expect(ig).toContain("😊");
    expect(li).not.toContain("😊");
    expect(llm.calls.map((c) => c.channel)).toEqual(["instagram", "linkedin"]);
    expect(llm.calls[0]?.system).not.toBe(llm.calls[1]?.system);
  });

  it("keeps only the last 15 messages per (platform, user)", async () => {
    const llm = new MockLLM();
    const store = new SqliteStore(":memory:", 15);
    const bot = new Ankeeta(llm, store);
    for (let i = 1; i <= 12; i++) await bot.reply({ platform: "instagram", userId: "u", text: `msg ${i}`, channel: "instagram" });

    const history = await store.getHistory("instagram", "u");
    expect(history).toHaveLength(15);
    // 24 stored messages trimmed to the most recent 15 → starts mid-conversation on an assistant turn
    expect(history.at(-1)?.content).toContain("msg 12");
    // and the LLM never receives more than history(15) + the new message
    expect(Math.max(...llm.calls.map((c) => c.messages.length))).toBeLessThanOrEqual(16);
  });

  it("isolates memory by platform as well as user id", async () => {
    const store = new SqliteStore(":memory:", 15);
    const bot = new Ankeeta(new MockLLM(), store);
    await bot.reply({ platform: "instagram", userId: "same", text: "ig msg", channel: "instagram" });
    expect(await store.getHistory("linkedin", "same")).toEqual([]);
  });

  it("replySafe returns the canned fallback on LLM failure", async () => {
    const llm = new MockLLM();
    llm.failNext = true;
    const bot = new Ankeeta(llm, new SqliteStore(":memory:", 15));
    const out = await bot.replySafe({ platform: "linkedin", userId: "u", text: "hi", channel: "linkedin" });
    expect(out.usedFallback).toBe(true);
    expect(out.reply).not.toMatch(/😅/);
  });
});

describe("LLM clients", () => {
  const cfg = loadConfig({ ...baseEnv, LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-test" }).llm;

  it("normalizeMessages merges consecutive roles and drops a leading assistant turn", () => {
    expect(
      normalizeMessages([
        { role: "assistant", content: "orphan" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "  " },
        { role: "assistant", content: "c" },
      ]),
    ).toEqual([
      { role: "user", content: "a\nb" },
      { role: "assistant", content: "c" },
    ]);
  });

  it("AnthropicClient sends system, model, key and messages, and returns the text", async () => {
    const fetchMock = vi.fn(async () => Response.json({ content: [{ type: "text", text: " hello there " }] }));
    const client = new AnthropicClient(cfg, fetchMock as unknown as typeof fetch);
    const out = await client.complete({ system: "SYS", channel: "instagram", maxTokens: 123, messages: [{ role: "user", content: "yo" }] });

    expect(out).toBe("hello there");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("llm-key");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "claude-test",
      max_tokens: 123,
      system: "SYS",
      messages: [{ role: "user", content: "yo" }],
    });
  });

  it("OpenAICompatibleClient puts the system prompt first", async () => {
    const openaiCfg = loadConfig({ ...baseEnv, LLM_PROVIDER: "openai", LLM_MODEL: "gpt-test" }).llm;
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: "hi!" } }] }));
    const client = new OpenAICompatibleClient(openaiCfg, fetchMock as unknown as typeof fetch);
    expect(await client.complete({ system: "SYS", channel: "linkedin", messages: [{ role: "user", content: "yo" }] })).toBe("hi!");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(init.body as string).messages[0]).toEqual({ role: "system", content: "SYS" });
  });

  it("raises LLMError on HTTP errors and empty replies", async () => {
    const bad = new AnthropicClient(cfg, (async () => new Response("overloaded", { status: 529 })) as typeof fetch, []);
    await expect(bad.complete({ system: "s", channel: "instagram", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/529/);
    const empty = new AnthropicClient(cfg, (async () => Response.json({ content: [] })) as typeof fetch);
    await expect(empty.complete({ system: "s", channel: "instagram", messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(LLMError);
  });

  it("retries temporary errors (503) and then succeeds", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response("overloaded", { status: 503 }) : Response.json({ content: [{ type: "text", text: "ok" }] }))) as typeof fetch;
    const client = new AnthropicClient(cfg, flaky, [0, 0]);
    expect(await client.complete({ system: "s", channel: "instagram", messages: [{ role: "user", content: "x" }] })).toBe("ok");
    expect(n).toBe(3);
  });

  it("gives up after the retries are used up", async () => {
    let n = 0;
    const down = (async () => (++n, new Response("overloaded", { status: 503 }))) as typeof fetch;
    const client = new OpenAICompatibleClient(cfg, down, [0, 0]);
    await expect(client.complete({ system: "s", channel: "linkedin", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/503/);
    expect(n).toBe(3);
  });

  it("does not retry permanent errors like 401 / 400", async () => {
    let n = 0;
    const bad = (async () => (++n, new Response("bad key", { status: 401 }))) as typeof fetch;
    const client = new AnthropicClient(cfg, bad, [0, 0]);
    await expect(client.complete({ system: "s", channel: "instagram", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/401/);
    expect(n).toBe(1);
  });

  it("createLLMClient without an API key fails at call time, not at boot", async () => {
    const client = createLLMClient({ ...cfg, apiKey: "" });
    await expect(client.complete({ system: "s", channel: "instagram", messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/LLM_API_KEY/);
  });
});
