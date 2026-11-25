import crypto from "node:crypto";
import express, { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { Ankeeta } from "../ankeeta.js";
import type { Config } from "../config.js";
import { errMessage, log } from "../logger.js";
import type { ConversationStore } from "../memory/index.js";
import type { BackgroundQueue } from "../queue.js";
import type { ChatMessage } from "../types.js";
import type { LinkedInPartnerAdapter } from "./partnerAdapter.js";

function keysMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Accepts `Authorization: Bearer <key>` or `X-API-Key: <key>`. */
function requireAdminKey(config: Config): RequestHandler {
  return (req, res, next) => {
    if (!config.linkedin.adminApiKey) {
      res.status(503).json({ error: "LinkedIn draft endpoint is disabled: set ADMIN_API_KEY to enable it." });
      return;
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(req.header("authorization") ?? "")?.[1];
    const provided = bearer ?? req.header("x-api-key") ?? "";
    if (!provided || !keysMatch(provided, config.linkedin.adminApiKey)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}

/** Accepts [{role:"them"|"me"|"user"|"assistant", text|content}] and maps to chat roles. */
function parseContext(value: unknown): ChatMessage[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) return undefined;
  const out: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return undefined;
    const { role, text, content } = item as Record<string, unknown>;
    const body = typeof text === "string" ? text : typeof content === "string" ? content : undefined;
    if (body === undefined) return undefined;
    if (role === "them" || role === "user") out.push({ role: "user", content: body.slice(0, 4000) });
    else if (role === "me" || role === "assistant") out.push({ role: "assistant", content: body.slice(0, 4000) });
    else return undefined;
  }
  return out;
}

export interface LinkedInDeps {
  config: Config;
  ankeeta: Ankeeta;
  store: ConversationStore;
  queue: BackgroundQueue;
  linkedinAdapter?: LinkedInPartnerAdapter | undefined;
}

/**
 * POST /api/linkedin/draft-reply  – human-in-the-loop drafting. Nothing is
 * sent anywhere; the caller copies the draft into LinkedIn themselves.
 */
export function createLinkedInApiRouter(deps: LinkedInDeps): Router {
  const { config, ankeeta } = deps;
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests, slow down a little." },
    }),
  );

  router.post("/draft-reply", requireAdminKey(config), express.json({ limit: "100kb" }), async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    // "Opening greeting" button: Ankeeta's first line for a new LinkedIn chat, to paste yourself.
    if (!message && body.opener === true) {
      const greeting = ankeeta.openingGreeting;
      if (!greeting) {
        res.status(404).json({ error: "No opening greeting is configured (GREETING_MESSAGE is empty)." });
        return;
      }
      res.json({ reply: greeting, channel: "linkedin", threadId: null });
      return;
    }

    if (!message) {
      res.status(400).json({ error: "`message` (the incoming LinkedIn message) is required." });
      return;
    }

    const threadId = typeof body.threadId === "string" && body.threadId.trim() ? body.threadId.trim().slice(0, 200) : undefined;
    const context = parseContext(body.context);
    if (context === undefined) {
      res.status(400).json({
        error: '`context` must be an array (max 50) of { role: "them" | "me", text: string }.',
      });
      return;
    }

    try {
      const reply = await ankeeta.reply({
        platform: "linkedin",
        // Without a threadId there is nothing to key memory on, so stay stateless.
        userId: threadId ?? "adhoc",
        text: message,
        channel: "linkedin",
        seedHistory: context,
        remember: threadId !== undefined,
      });
      res.json({ reply, channel: "linkedin", threadId: threadId ?? null });
    } catch (err) {
      log.error("linkedin draft failed", { error: errMessage(err) });
      res.status(502).json({ error: "Could not generate a draft right now. Please try again." });
    }
  });

  return router;
}

/**
 * /webhook/linkedin – only active when an approved LinkedIn Partner adapter is
 * supplied (see ./partnerAdapter.ts). Otherwise answers 501.
 */
export function createLinkedInWebhookRouter(deps: LinkedInDeps): Router {
  const { ankeeta, store, queue, linkedinAdapter } = deps;
  const router = Router();

  if (!linkedinAdapter) {
    router.all("/", (_req, res) => {
      res.status(501).json({
        error: "LinkedIn partner messaging is not configured. Use POST /api/linkedin/draft-reply instead.",
      });
    });
    return router;
  }

  router.post("/", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!linkedinAdapter.verifyRequest(raw, req.headers)) {
      res.sendStatus(401);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      res.sendStatus(400);
      return;
    }
    res.sendStatus(200);

    for (const msg of linkedinAdapter.parseEvents(parsed)) {
      queue.run(`linkedin:${msg.senderId}`, async () => {
        if (!(await store.markEventSeen(`linkedin:${msg.messageId}`))) return;
        const { reply } = await ankeeta.replySafe({
          platform: "linkedin",
          userId: msg.senderId,
          text: msg.text,
          channel: "linkedin",
        });
        await linkedinAdapter.sendMessage(msg.senderId, reply);
      });
    }
  });

  return router;
}
