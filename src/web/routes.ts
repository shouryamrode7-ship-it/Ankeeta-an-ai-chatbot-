import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Ankeeta } from "../ankeeta.js";

const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_MESSAGE_CHARS = 1000;

/**
 * Public live chat for the website. Anyone can talk to Ankeeta here, so it is
 * rate limited per IP to keep LLM costs bounded. The browser keeps a random
 * session id so Ankeeta remembers the conversation.
 */
export function createWebChatRouter(deps: { ankeeta: Ankeeta; ratePerMinute?: number }): Router {
  const { ankeeta } = deps;
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.ratePerMinute ?? 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "You're chatting a little fast – give me a moment and try again 🙂" },
    }),
    express.json({ limit: "10kb" }),
  );

  router.post("/start", async (req, res) => {
    const sessionId = (req.body as Record<string, unknown> | undefined)?.sessionId;
    if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
      res.status(400).json({ error: "Invalid session." });
      return;
    }
    res.json({ messages: await ankeeta.openChat("web", sessionId) });
  });

  router.post("/", async (req, res) => {
    const { sessionId, message } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
      res.status(400).json({ error: "Invalid session." });
      return;
    }
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      res.status(400).json({ error: "Please type a message." });
      return;
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE_CHARS} characters.` });
      return;
    }

    const { reply, usedFallback } = await ankeeta.replySafe({
      platform: "web",
      userId: sessionId,
      text,
      channel: "web",
    });
    res.json({ reply, usedFallback });
  });

  return router;
}
