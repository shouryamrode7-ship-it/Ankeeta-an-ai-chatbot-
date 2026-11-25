import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/persona.js";
import { signBody } from "../src/instagram/signature.js";
import { WhatsAppCloudSender } from "../src/whatsapp/graph.js";
import { loadConfig } from "../src/config.js";
import { baseEnv, makeHarness, SECRET, waPayload } from "./helpers.js";

const OWNER = "919800000001"; // matches WHATSAPP_ALLOWED_NUMBERS in tests/helpers.ts

async function post(app: Parameters<typeof request>[0], payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  return request(app).post("/webhook/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", signBody(body, secret)).send(body);
}

describe("GET /webhook/whatsapp (verification)", () => {
  const q = (token: string, mode = "subscribe") => ({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": "777" });

  it("echoes the challenge for the right token", async () => {
    const res = await request(makeHarness().app).get("/webhook/whatsapp").query(q("wa-verify"));
    expect(res.status).toBe(200);
    expect(res.text).toBe("777");
  });

  it("rejects wrong token / mode and an unset token", async () => {
    const { app } = makeHarness();
    expect((await request(app).get("/webhook/whatsapp").query(q("bad"))).status).toBe(403);
    expect((await request(app).get("/webhook/whatsapp").query(q("wa-verify", "unsubscribe"))).status).toBe(403);
    const unset = makeHarness({ ...baseEnv, WHATSAPP_VERIFY_TOKEN: "" });
    expect((await request(unset.app).get("/webhook/whatsapp").query(q(""))).status).toBe(403);
  });
});

describe("POST /webhook/whatsapp", () => {
  it("rejects missing or wrong signatures", async () => {
    const { app, llm, queue } = makeHarness();
    const payload = waPayload([{ from: OWNER, text: "hi" }]);
    expect((await request(app).post("/webhook/whatsapp").set("content-type", "application/json").send(JSON.stringify(payload))).status).toBe(401);
    expect((await post(app, payload, "wrong")).status).toBe(401);
    await queue.drain();
    expect(llm.calls).toHaveLength(0);
  });

  it("fails closed when no app secret is configured", async () => {
    const { app } = makeHarness({ ...baseEnv, INSTAGRAM_APP_SECRET: "", WHATSAPP_APP_SECRET: "" });
    expect((await post(app, waPayload([{ from: OWNER, text: "hi" }]), "")).status).toBe(503);
  });

  it("uses WHATSAPP_APP_SECRET when provided instead of the Instagram one", async () => {
    const { app, queue, waSent } = makeHarness({ ...baseEnv, WHATSAPP_APP_SECRET: "wa-secret" });
    expect((await post(app, waPayload([{ from: OWNER, text: "hi" }]), SECRET)).status).toBe(401);
    expect((await post(app, waPayload([{ from: OWNER, text: "hi" }]), "wa-secret")).status).toBe(200);
    await queue.drain();
    expect(waSent).toHaveLength(1);
  });

  it("replies via the WhatsApp sender using the whatsapp channel and remembers context", async () => {
    const { app, llm, queue, waSent } = makeHarness();
    await post(app, waPayload([{ from: OWNER, text: "I love cricket" }]));
    await queue.drain();
    await post(app, waPayload([{ from: OWNER, text: "who's your favourite player?" }]));
    await queue.drain();

    expect(llm.calls[0]?.channel).toBe("whatsapp");
    expect(llm.calls[0]?.system).toContain("Channel: whatsapp");
    expect(waSent[0]).toEqual({ to: OWNER, text: "hi there 🙂 you said: I love cricket" });
    expect(llm.calls[1]?.messages.map((m) => m.content)).toEqual(["I love cricket", "hi there 🙂 you said: I love cricket", "who's your favourite player?"]);
  });

  it("ignores non-text messages and status receipts", async () => {
    const { app, llm, queue } = makeHarness();
    await post(app, waPayload([{ from: OWNER, type: "image" }, { from: OWNER, text: "  " }]));
    const statuses = waPayload([]);
    (statuses.entry[0]!.changes[0]!.value as any).statuses = [{ id: "x", status: "delivered" }];
    expect((await post(app, statuses)).status).toBe(200);
    await queue.drain();
    expect(llm.calls).toHaveLength(0);
  });

  it("ignores other objects and processes a redelivered message id only once", async () => {
    const { app, llm, queue } = makeHarness();
    await post(app, { ...waPayload([{ from: OWNER, text: "hi" }]), object: "instagram" });
    const p = waPayload([{ from: OWNER, text: "hi", id: "wamid.fixed" }]);
    await post(app, p);
    await post(app, p);
    await queue.drain();
    expect(llm.calls).toHaveLength(1);
  });

  it("sends the fallback when the LLM fails", async () => {
    const { app, llm, queue, waSent } = makeHarness();
    llm.failNext = true;
    await post(app, waPayload([{ from: OWNER, text: "hi" }]));
    await queue.drain();
    expect(waSent[0]?.text).toMatch(/hiccup/i);
  });
});

describe("WhatsApp is owner-only", () => {
  it("ignores messages from numbers that are not on the allowlist (no LLM call, no reply)", async () => {
    const { app, llm, queue, waSent } = makeHarness();
    const res = await post(app, waPayload([{ from: "911111111111", text: "hello Ankeeta, who are you?" }]));
    await queue.drain();
    expect(res.status).toBe(200); // still acknowledged so Meta doesn't retry
    expect(llm.calls).toHaveLength(0);
    expect(waSent).toHaveLength(0);
  });

  it("answers the owner but not a stranger in the same webhook batch", async () => {
    const { app, llm, queue, waSent } = makeHarness();
    await post(app, waPayload([{ from: "922222222222", text: "intruder message" }, { from: OWNER, text: "owner message" }]));
    await queue.drain();
    expect(llm.calls).toHaveLength(1);
    expect(waSent.map((m) => m.to)).toEqual([OWNER]);
  });

  it("supports several allowed numbers and tolerates formatting in the env value", async () => {
    const { app, queue, waSent } = makeHarness({ ...baseEnv, WHATSAPP_ALLOWED_NUMBERS: "+91 98000-00001, 14155550123" });
    await post(app, waPayload([{ from: "14155550123", text: "hi from the second number" }]));
    await queue.drain();
    expect(waSent.map((m) => m.to)).toEqual(["14155550123"]);
  });

  it("with no allowlist configured, ignores everyone (fail closed)", async () => {
    const { app, llm, queue } = makeHarness({ ...baseEnv, WHATSAPP_ALLOWED_NUMBERS: "" });
    await post(app, waPayload([{ from: OWNER, text: "hello" }]));
    await queue.drain();
    expect(llm.calls).toHaveLength(0);
  });
});

describe("WhatsApp persona + sender", () => {
  it("has a friendly mobile tone and all guardrails", () => {
    const p = buildSystemPrompt("whatsapp");
    expect(p).toContain("Channel: whatsapp");
    expect(p).toContain("1–4 short sentences");
    expect(p).toMatch(/You are an AI/);
    expect(p).toMatch(/Never promote, sell or recommend/);
  });

  it("WhatsAppCloudSender posts the Cloud API payload to the phone-number-id endpoint", async () => {
    const calls: Array<[string, RequestInit]> = [];
    const f = (async (u: string, i: RequestInit) => {
      calls.push([u, i]);
      return Response.json({ messages: [{ id: "wamid.1" }] });
    }) as unknown as typeof fetch;
    await new WhatsAppCloudSender(loadConfig(baseEnv).whatsapp, f).sendText(OWNER, "hello");
    expect(calls[0]?.[0]).toBe("https://graph.facebook.com/v23.0/10555/messages");
    expect((calls[0]?.[1].headers as Record<string, string>).authorization).toBe("Bearer wa-token");
    expect(JSON.parse(calls[0]?.[1].body as string)).toMatchObject({ messaging_product: "whatsapp", to: OWNER, type: "text", text: { body: "hello" } });
  });

  it("sender throws on HTTP errors", async () => {
    const s = new WhatsAppCloudSender(loadConfig(baseEnv).whatsapp, (async () => new Response("no", { status: 401 })) as typeof fetch);
    await expect(s.sendText("1", "x")).rejects.toThrow(/401/);
  });
});
