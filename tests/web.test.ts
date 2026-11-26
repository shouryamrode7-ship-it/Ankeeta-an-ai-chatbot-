import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEFAULT_GREETING } from "../src/persona.js";
import { baseEnv, makeHarness } from "./helpers.js";

const S1 = "a".repeat(24);
const S2 = "b".repeat(24);

describe("web chat", () => {
  it("opens a new chat with Ankeeta's greeting, once, and resumes it on reload", async () => {
    const { app, llm } = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    const first = await request(app).post("/api/chat/start").send({ sessionId: S1 });
    expect(first.status).toBe(200);
    expect(first.body.messages).toEqual([{ role: "assistant", content: DEFAULT_GREETING }]);
    const again = await request(app).post("/api/chat/start").send({ sessionId: S1 });
    expect(again.body.messages).toEqual([{ role: "assistant", content: DEFAULT_GREETING }]);
    expect(llm.calls).toHaveLength(0);
  });

  it("starts empty when no greeting is configured", async () => {
    const { app } = makeHarness();
    expect((await request(app).post("/api/chat/start").send({ sessionId: S1 })).body.messages).toEqual([]);
  });

  it("answers messages via the LLM using the web channel and remembers the greeting + context", async () => {
    const { app, llm } = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    await request(app).post("/api/chat/start").send({ sessionId: S1 });
    const res = await request(app).post("/api/chat").send({ sessionId: S1, message: "my day is great!" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toContain("my day is great!");
    expect(llm.calls[0]?.channel).toBe("web");
    expect(llm.calls[0]?.system).toContain("Channel: web");
    const sent = llm.calls[0]!.messages;
    expect(sent.at(-1)).toEqual({ role: "user", content: "my day is great!" });
    expect(sent.some((m) => m.role === "assistant" && m.content === DEFAULT_GREETING)).toBe(true);
  });

  it("keeps different visitors separate", async () => {
    const { app, llm } = makeHarness();
    await request(app).post("/api/chat").send({ sessionId: S1, message: "I'm Alice" });
    await request(app).post("/api/chat").send({ sessionId: S2, message: "I'm Bob" });
    expect(llm.calls[1]?.messages).toEqual([{ role: "user", content: "I'm Bob" }]);
  });

  it("validates session ids and messages", async () => {
    const { app } = makeHarness();
    expect((await request(app).post("/api/chat").send({ sessionId: "short", message: "hi" })).status).toBe(400);
    expect((await request(app).post("/api/chat").send({ sessionId: "../../etc/passwd-0000000000" , message: "hi" })).status).toBe(400);
    expect((await request(app).post("/api/chat/start").send({})).status).toBe(400);
    expect((await request(app).post("/api/chat").send({ sessionId: S1, message: "   " })).status).toBe(400);
    expect((await request(app).post("/api/chat").send({ sessionId: S1, message: "x".repeat(1001) })).status).toBe(400);
  });

  it("returns a friendly fallback when the LLM fails", async () => {
    const { app, llm } = makeHarness();
    llm.failNext = true;
    const res = await request(app).post("/api/chat").send({ sessionId: S1, message: "hello there friend" });
    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(true);
    expect(res.body.reply).toMatch(/hiccup/i);
  });

  it("rate limits a flood of requests from one IP (cost protection)", async () => {
    const { app } = makeHarness();
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await request(app).post("/api/chat").send({ sessionId: S1, message: `m${i}` })).status;
    expect(last).toBe(429);
  });

  it("serves the chat page and the landing page links to it", async () => {
    const { app } = makeHarness();
    const page = await request(app).get("/chat");
    expect(page.status).toBe(200);
    expect(page.text).toContain("Chat with Ankeeta");
    expect((await request(app).get("/")).text).toContain('href="/chat"');
    expect((await request(app).get("/ig")).headers.location).toBe("/chat?from=instagram");
  });
});
