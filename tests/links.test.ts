import request from "supertest";
import { describe, expect, it } from "vitest";
import { makeHarness } from "./helpers.js";

describe("share links and basic routes", () => {
  it.each([
    ["/ig", "/chat?from=instagram"],
    ["/li", "/chat?from=linkedin"],
    ["/wa", "/chat?from=whatsapp"],
  ])("GET %s opens the web chat", async (route, target) => {
    const res = await request(makeHarness().app).get(route);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(target);
  });

  it("the links work with no configuration at all", async () => {
    const { app } = makeHarness({ LLM_API_KEY: "x" });
    for (const route of ["/ig", "/li", "/wa"]) expect((await request(app).get(route)).status).toBe(302);
  });

  it("GET / serves the landing page pointing to the web chat", async () => {
    const res = await request(makeHarness().app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain('href="/chat"');
    expect(res.text).toContain("Start Chatting");
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
