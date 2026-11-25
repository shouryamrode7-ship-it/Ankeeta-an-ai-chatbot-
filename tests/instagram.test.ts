import request from "supertest";
import { describe, expect, it } from "vitest";
import { signBody, verifySignature } from "../src/instagram/signature.js";
import { baseEnv, igPayload, makeHarness, SECRET, VERIFY } from "./helpers.js";

async function post(app: Parameters<typeof request>[0], payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  return request(app)
    .post("/webhook/instagram")
    .set("content-type", "application/json")
    .set("x-hub-signature-256", signBody(body, secret))
    .send(body);
}

describe("GET /webhook/instagram (Meta verification)", () => {
  it("echoes hub.challenge when mode and token are correct", async () => {
    const { app } = makeHarness();
    const res = await request(app).get("/webhook/instagram").query({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY,
      "hub.challenge": "1158201444",
    });
    expect(res.status).toBe(200);
    expect(res.text).toBe("1158201444");
  });

  it("rejects a wrong verify token", async () => {
    const { app } = makeHarness();
    const res = await request(app).get("/webhook/instagram").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "nope",
      "hub.challenge": "abc",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a wrong mode and missing params", async () => {
    const { app } = makeHarness();
    expect(
      (await request(app).get("/webhook/instagram").query({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "x" })).status,
    ).toBe(403);
    expect((await request(app).get("/webhook/instagram")).status).toBe(403);
  });

  it("never verifies when no verify token is configured (empty == empty trap)", async () => {
    const { app } = makeHarness({ ...baseEnv, INSTAGRAM_VERIFY_TOKEN: "" });
    const res = await request(app).get("/webhook/instagram").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "",
      "hub.challenge": "abc",
    });
    expect(res.status).toBe(403);
  });
});

describe("signature validation", () => {
  it("verifySignature accepts a correct signature and rejects tampering", () => {
    const body = Buffer.from('{"a":1}');
    const good = signBody(body, SECRET);
    expect(verifySignature(body, good, SECRET)).toBe(true);
    expect(verifySignature(Buffer.from('{"a":2}'), good, SECRET)).toBe(false);
    expect(verifySignature(body, signBody(body, "other-secret"), SECRET)).toBe(false);
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", SECRET)).toBe(false);
    expect(verifySignature(body, good, "")).toBe(false);
  });

  it("POST rejects a missing signature with 401 and does nothing", async () => {
    const { app, llm, queue } = makeHarness();
    const res = await request(app).post("/webhook/instagram").set("content-type", "application/json").send(JSON.stringify(igPayload([{ sender: "u1", text: "hi" }])));
    await queue.drain();
    expect(res.status).toBe(401);
    expect(llm.calls).toHaveLength(0);
  });

  it("POST rejects a signature made with the wrong secret", async () => {
    const { app, llm, queue } = makeHarness();
    const res = await post(app, igPayload([{ sender: "u1", text: "hi" }]), "wrong-secret");
    await queue.drain();
    expect(res.status).toBe(401);
    expect(llm.calls).toHaveLength(0);
  });

  it("POST fails closed (503) when INSTAGRAM_APP_SECRET is not configured", async () => {
    const { app } = makeHarness({ ...baseEnv, INSTAGRAM_APP_SECRET: "" });
    const res = await post(app, igPayload([{ sender: "u1", text: "hi" }]), "");
    expect(res.status).toBe(503);
  });

  it("POST rejects a validly signed but malformed JSON body with 400", async () => {
    const { app } = makeHarness();
    const raw = "{not json";
    const res = await request(app)
      .post("/webhook/instagram")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", signBody(raw, SECRET))
      .send(raw);
    expect(res.status).toBe(400);
  });
});

describe("POST /webhook/instagram (message handling)", () => {
  it("replies to a text DM via the Graph API using the instagram channel", async () => {
    const { app, llm, queue, sent } = makeHarness();
    const res = await post(app, igPayload([{ sender: "user-1", text: "hello ankeeta" }]));
    expect(res.status).toBe(200);
    await queue.drain();

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.channel).toBe("instagram");
    expect(llm.calls[0]?.system).toContain("Channel: instagram");
    expect(llm.calls[0]?.messages).toEqual([{ role: "user", content: "hello ankeeta" }]);
    expect(sent).toEqual([{ to: "user-1", text: "hey! 😊 you said: hello ankeeta" }]);
  });

  it("remembers earlier messages from the same user across webhook calls", async () => {
    const { app, llm, queue } = makeHarness();
    await post(app, igPayload([{ sender: "user-1", text: "I love jazz" }]));
    await queue.drain();
    await post(app, igPayload([{ sender: "user-1", text: "any album ideas?" }]));
    await queue.drain();

    const second = llm.calls[1]!;
    expect(second.messages.map((m) => m.content)).toEqual([
      "I love jazz",
      "hey! 😊 you said: I love jazz",
      "any album ideas?",
    ]);
  });

  it("keeps conversations of different users separate", async () => {
    const { app, llm, queue } = makeHarness();
    await post(app, igPayload([{ sender: "alice", text: "I am Alice" }]));
    await queue.drain();
    await post(app, igPayload([{ sender: "bob", text: "I am Bob" }]));
    await queue.drain();
    expect(llm.calls[1]?.messages).toEqual([{ role: "user", content: "I am Bob" }]);
  });

  it("ignores echo events (the bot's own messages)", async () => {
    const { app, llm, queue, sent } = makeHarness();
    await post(app, igPayload([{ sender: "user-1", text: "echoed", echo: true }]));
    await queue.drain();
    expect(llm.calls).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("ignores messages sent by the bot's own account id", async () => {
    const { app, llm, queue } = makeHarness();
    await post(app, igPayload([{ sender: "17841400000000000", text: "self" }]));
    await queue.drain();
    expect(llm.calls).toHaveLength(0);
  });

  it("ignores non-text events (attachments, reactions, empty text)", async () => {
    const { app, llm, queue } = makeHarness();
    const payload = igPayload([{ sender: "u1" }, { sender: "u2", text: "   " }]);
    // reaction-style event with no `message` at all
    (payload.entry[0]!.messaging as unknown[]).push({ sender: { id: "u3" }, recipient: { id: "x" }, reaction: { emoji: "❤️" } });
    const res = await post(app, payload);
    await queue.drain();
    expect(res.status).toBe(200);
    expect(llm.calls).toHaveLength(0);
  });

  it("ignores payloads for other objects", async () => {
    const { app, llm, queue } = makeHarness();
    const res = await post(app, { ...igPayload([{ sender: "u1", text: "hi" }]), object: "page" });
    await queue.drain();
    expect(res.status).toBe(200);
    expect(llm.calls).toHaveLength(0);
  });

  it("processes a redelivered event (same mid) only once", async () => {
    const { app, llm, queue, sent } = makeHarness();
    const payload = igPayload([{ sender: "u1", text: "hi", mid: "mid-fixed" }]);
    await post(app, payload);
    await post(app, payload);
    await queue.drain();
    expect(llm.calls).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("sends a friendly fallback if the LLM fails, and does not store it as memory", async () => {
    const { app, llm, queue, sent, store } = makeHarness();
    llm.failNext = true;
    await post(app, igPayload([{ sender: "u1", text: "hi" }]));
    await queue.drain();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toMatch(/glitched/i);
    expect(await store.getHistory("instagram", "u1")).toEqual([]);
  });

  it("survives a failing Graph API send without crashing the queue", async () => {
    const { app, queue, instagramSender, llm } = makeHarness();
    (instagramSender.sendText as any).mockRejectedValueOnce(new Error("graph down"));
    await post(app, igPayload([{ sender: "u1", text: "one" }]));
    await queue.drain();
    await post(app, igPayload([{ sender: "u1", text: "two" }]));
    await queue.drain();
    expect(llm.calls).toHaveLength(2);
    expect(instagramSender.sendText).toHaveBeenCalledTimes(2);
  });

  it("caps replies at Instagram's length limit", async () => {
    const { app, llm, queue, sent } = makeHarness();
    llm.complete = async () => "word ".repeat(600);
    await post(app, igPayload([{ sender: "u1", text: "tell me a lot" }]));
    await queue.drain();
    expect(sent[0]!.text.length).toBeLessThanOrEqual(900);
  });
});
