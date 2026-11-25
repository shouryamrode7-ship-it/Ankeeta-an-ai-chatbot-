import request from "supertest";
import { describe, expect, it } from "vitest";
import { baseEnv, makeHarness } from "./helpers.js";

describe("share links and basic routes", () => {
  it("GET /ig redirects to the Instagram DM composer", async () => {
    const { app } = makeHarness();
    const res = await request(app).get("/ig");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://ig.me/m/ankeeta.ai?ref=ig_link");
  });

  it("GET /li (LinkedIn link) opens the web chat, not LinkedIn", async () => {
    const res = await request(makeHarness().app).get("/li");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/chat?from=linkedin");
  });

  it("GET /wa (WhatsApp link) opens the web chat, not WhatsApp", async () => {
    const res = await request(makeHarness().app).get("/wa");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/chat?from=whatsapp");
  });

  it("/li and /wa work with no configuration at all", async () => {
    const { app } = makeHarness({ LLM_API_KEY: "x" });
    expect((await request(app).get("/li")).status).toBe(302);
    expect((await request(app).get("/wa")).status).toBe(302);
  });

  it("tolerates @username and full-URL handles for Instagram", async () => {
    const a = makeHarness({ ...baseEnv, INSTAGRAM_USERNAME: "@ankeeta.ai" });
    expect((await request(a.app).get("/ig")).headers.location).toBe("https://ig.me/m/ankeeta.ai?ref=ig_link");
    const b = makeHarness({ ...baseEnv, INSTAGRAM_USERNAME: "https://www.instagram.com/ankeeta.ai/" });
    expect((await request(b.app).get("/ig")).headers.location).toBe("https://ig.me/m/ankeeta.ai?ref=ig_link");
  });

  it("/ig returns 503 (not a broken redirect) when the username is missing or unsafe", async () => {
    expect((await request(makeHarness({ ...baseEnv, INSTAGRAM_USERNAME: "" }).app).get("/ig")).status).toBe(503);
    expect((await request(makeHarness({ ...baseEnv, INSTAGRAM_USERNAME: "evil/../x?y=1" }).app).get("/ig")).status).toBe(503);
  });

  it("GET / serves the landing page with the web chat and Instagram buttons", async () => {
    const res = await request(makeHarness().app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain('href="/chat"');
    expect(res.text).toContain("Chat with Ankeeta on Instagram");
    expect(res.text).toContain('href="/ig"');
  });

  it("GET /health returns status ok", async () => {
    const res = await request(makeHarness().app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", bot: "Ankeeta" });
  });

  it("GET /linkedin serves the (optional) draft helper page", async () => {
    const res = await request(makeHarness().app).get("/linkedin");
    expect(res.status).toBe(200);
    expect(res.text).toContain("LinkedIn draft helper");
  });

  it("unknown routes return JSON 404", async () => {
    expect((await request(makeHarness().app).get("/nope")).status).toBe(404);
  });
});
