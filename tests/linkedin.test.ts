import request from "supertest";
import { describe, expect, it } from "vitest";
import type { LinkedInPartnerAdapter } from "../src/linkedin/partnerAdapter.js";
import { ADMIN, baseEnv, makeHarness } from "./helpers.js";

const auth = { authorization: `Bearer ${ADMIN}` };

describe("POST /api/linkedin/draft-reply", () => {
  it("requires the admin key (401 without / with a wrong key)", async () => {
    const { app, llm } = makeHarness();
    expect((await request(app).post("/api/linkedin/draft-reply").send({ message: "hi" })).status).toBe(401);
    expect((await request(app).post("/api/linkedin/draft-reply").set("authorization", "Bearer nope").send({ message: "hi" })).status).toBe(401);
    expect(llm.calls).toHaveLength(0);
  });

  it("is disabled (503) when ADMIN_API_KEY is not set", async () => {
    const { app } = makeHarness({ ...baseEnv, ADMIN_API_KEY: "" });
    const res = await request(app).post("/api/linkedin/draft-reply").send({ message: "hi" });
    expect(res.status).toBe(503);
  });

  it("accepts X-API-Key as well as Bearer", async () => {
    const { app } = makeHarness();
    const res = await request(app).post("/api/linkedin/draft-reply").set("x-api-key", ADMIN).send({ message: "hi" });
    expect(res.status).toBe(200);
  });

  it("validates input", async () => {
    const { app } = makeHarness();
    expect((await request(app).post("/api/linkedin/draft-reply").set(auth).send({})).status).toBe(400);
    expect((await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "  " })).status).toBe(400);
    expect(
      (await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "hi", context: [{ role: "boss", text: "x" }] })).status,
    ).toBe(400);
  });

  it("drafts a reply using the linkedin channel (polished tone, no emoji prompt)", async () => {
    const { app, llm } = makeHarness();
    const res = await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "Loved your post on hiking!" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Thanks for sharing. You said: Loved your post on hiking!", channel: "linkedin", threadId: null });
    expect(llm.calls[0]?.channel).toBe("linkedin");
    expect(llm.calls[0]?.system).toContain("Channel: linkedin");
    expect(llm.calls[0]?.system).toContain("No heavy slang and no emojis");
  });

  it("stays stateless without a threadId", async () => {
    const { app, llm, store } = makeHarness();
    await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "one" });
    await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "two" });
    expect(llm.calls[1]?.messages).toEqual([{ role: "user", content: "two" }]);
    expect(await store.getHistory("linkedin", "adhoc")).toEqual([]);
  });

  it("remembers a thread across calls when threadId is given", async () => {
    const { app, llm } = makeHarness();
    await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "I run a bakery", threadId: "priya" });
    await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "what should I bake?", threadId: "priya" });
    expect(llm.calls[1]?.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(llm.calls[1]?.messages[0]?.content).toBe("I run a bakery");
  });

  it("seeds a new thread from pasted context (them → user, me → assistant)", async () => {
    const { app, llm } = makeHarness();
    await request(app)
      .post("/api/linkedin/draft-reply")
      .set(auth)
      .send({
        message: "Sounds great, when?",
        threadId: "sam",
        context: [
          { role: "them", text: "Want to catch up?" },
          { role: "me", text: "Sure!" },
        ],
      });
    expect(llm.calls[0]?.messages).toEqual([
      { role: "user", content: "Want to catch up?" },
      { role: "assistant", content: "Sure!" },
      { role: "user", content: "Sounds great, when?" },
    ]);
  });

  it("returns 502 (not a canned reply) when the LLM fails, so no junk gets pasted", async () => {
    const { app, llm } = makeHarness();
    llm.failNext = true;
    const res = await request(app).post("/api/linkedin/draft-reply").set(auth).send({ message: "hi" });
    expect(res.status).toBe(502);
    expect(res.body.reply).toBeUndefined();
  });
});

describe("/webhook/linkedin partner adapter", () => {
  it("answers 501 when no approved partner adapter is configured", async () => {
    const { app } = makeHarness();
    expect((await request(app).post("/webhook/linkedin").send({})).status).toBe(501);
    expect((await request(app).get("/webhook/linkedin")).status).toBe(501);
  });

  it("verifies, parses, replies and sends through an injected adapter", async () => {
    const delivered: Array<{ to: string; text: string }> = [];
    const adapter: LinkedInPartnerAdapter = {
      verifyRequest: (_raw, headers) => headers["x-test-sig"] === "ok",
      parseEvents: (body: any) => [{ senderId: body.from, messageId: body.id, text: body.text }],
      sendMessage: async (to, text) => {
        delivered.push({ to, text });
      },
    };
    const { app, llm, queue } = makeHarness(baseEnv, { linkedinAdapter: adapter });

    const bad = await request(app).post("/webhook/linkedin").send({ from: "p1", id: "m1", text: "hi" });
    expect(bad.status).toBe(401);

    const ok = await request(app).post("/webhook/linkedin").set("x-test-sig", "ok").send({ from: "p1", id: "m1", text: "hi" });
    expect(ok.status).toBe(200);
    // redelivery is ignored
    await request(app).post("/webhook/linkedin").set("x-test-sig", "ok").send({ from: "p1", id: "m1", text: "hi" });
    await queue.drain();

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]?.channel).toBe("linkedin");
    expect(delivered).toEqual([{ to: "p1", text: "Thanks for sharing. You said: hi" }]);
  });
});
