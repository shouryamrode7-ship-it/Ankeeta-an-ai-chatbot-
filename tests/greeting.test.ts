import request from "supertest";
import { describe, expect, it } from "vitest";
import { Ankeeta } from "../src/ankeeta.js";
import { loadConfig } from "../src/config.js";
import { DEFAULT_GREETING, isGreetingOnly } from "../src/persona.js";
import { signBody } from "../src/instagram/signature.js";
import { SqliteStore } from "../src/memory/sqlite.js";
import { ADMIN, baseEnv, igPayload, makeHarness, MockLLM, SECRET, waPayload } from "./helpers.js";

describe("isGreetingOnly", () => {
  it.each(["hi", "Hii!!", "Hey 👋", "heyyy", "Hello Ankeeta", "hi ankeeta 👋", "Hi Ankeeta! 👋", "good morning", "namaste", "Yo"])("accepts %j", (t) => {
    expect(isGreetingOnly(t)).toBe(true);
  });
  it.each(["", "👋", "hi, can you recommend a movie?", "hello how are you", "I love hiking", "hey ankeeta tell me a joke"])("rejects %j", (t) => {
    expect(isGreetingOnly(t)).toBe(false);
  });
});

describe("opening greeting", () => {
  it("default greeting is Ankeeta's signature line", () => {
    expect(DEFAULT_GREETING).toBe("Heyy! 😊 I’m Ankeeta, and I’m always up for a good conversation. Tell me how your day is going.");
    expect(loadConfig({}).greeting).toBe(DEFAULT_GREETING);
    expect(loadConfig({ GREETING_MESSAGE: "" }).greeting).toBe("");
  });

  it("greets a brand-new chat that starts with 'hi' without calling the LLM, and remembers it", async () => {
    const llm = new MockLLM();
    const store = new SqliteStore(":memory:", 15);
    const bot = new Ankeeta(llm, store, { greeting: DEFAULT_GREETING });
    expect(await bot.reply({ platform: "whatsapp", userId: "u", text: "Hi Ankeeta! 👋", channel: "whatsapp" })).toBe(DEFAULT_GREETING);
    expect(llm.calls).toHaveLength(0);

    await bot.reply({ platform: "whatsapp", userId: "u", text: "I'm good, just back from a hike", channel: "whatsapp" });
    expect(llm.calls[0]?.messages.map((m) => m.content)).toEqual(["Hi Ankeeta! 👋", DEFAULT_GREETING, "I'm good, just back from a hike"]);
  });

  it("does not use the greeting when the first message has real content, or when chat already exists", async () => {
    const llm = new MockLLM();
    const bot = new Ankeeta(llm, new SqliteStore(":memory:", 15), { greeting: DEFAULT_GREETING });
    await bot.reply({ platform: "instagram", userId: "a", text: "hi, any movie recommendations?", channel: "instagram" });
    expect(llm.calls).toHaveLength(1);
    await bot.reply({ platform: "instagram", userId: "a", text: "hey", channel: "instagram" });
    expect(llm.calls).toHaveLength(2); // existing conversation → normal reply
  });

  it("is disabled when no greeting is configured", async () => {
    const llm = new MockLLM();
    const bot = new Ankeeta(llm, new SqliteStore(":memory:", 15));
    await bot.reply({ platform: "instagram", userId: "a", text: "hi", channel: "instagram" });
    expect(llm.calls).toHaveLength(1);
  });

  it("Instagram: first 'hi' DM gets the greeting", async () => {
    const { app, queue, sent, llm } = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    const body = JSON.stringify(igPayload([{ sender: "new-user", text: "hey" }]));
    await request(app).post("/webhook/instagram").set("content-type", "application/json").set("x-hub-signature-256", signBody(body, SECRET)).send(body);
    await queue.drain();
    expect(sent).toEqual([{ to: "new-user", text: DEFAULT_GREETING }]);
    expect(llm.calls).toHaveLength(0);
  });

  it("WhatsApp: the /wa prefilled 'Hi Ankeeta! 👋' gets the greeting", async () => {
    const { app, queue, waSent, llm } = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    const body = JSON.stringify(waPayload([{ from: "919800000001", text: "Hi Ankeeta! 👋" }]));
    await request(app).post("/webhook/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", signBody(body, SECRET)).send(body);
    await queue.drain();
    expect(waSent).toEqual([{ to: "919800000001", text: DEFAULT_GREETING }]);
    expect(llm.calls).toHaveLength(0);
  });

  it("LinkedIn: 'opener' returns the greeting for you to paste; 404 if disabled", async () => {
    const auth = { authorization: `Bearer ${ADMIN}` };
    const on = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    const res = await request(on.app).post("/api/linkedin/draft-reply").set(auth).send({ opener: true });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe(DEFAULT_GREETING);
    expect(on.llm.calls).toHaveLength(0);

    const off = makeHarness();
    expect((await request(off.app).post("/api/linkedin/draft-reply").set(auth).send({ opener: true })).status).toBe(404);
  });

  it("LinkedIn: a pasted first message that is just 'hi' also yields the greeting", async () => {
    const { app } = makeHarness(baseEnv, { greeting: DEFAULT_GREETING });
    const res = await request(app).post("/api/linkedin/draft-reply").set({ authorization: `Bearer ${ADMIN}` }).send({ message: "Hi!" });
    expect(res.body.reply).toBe(DEFAULT_GREETING);
  });
});
