import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Ankeeta } from "../ankeeta.js";

const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_MESSAGE_CHARS = 1000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_CHARS = 15_000;
const MAX_ATTACHMENTS_TOTAL_CHARS = 30_000;
/** Message + attached text, as sent to the model (the attachments are clipped separately above). */
const MAX_COMBINED_CHARS = MAX_MESSAGE_CHARS + MAX_ATTACHMENTS_TOTAL_CHARS + 1000;

interface Attachment { name: string; text: string }

/** Validates the optional `attachments` field. Returns an error message for malformed input. */
function parseAttachments(raw: unknown): { attachments: Attachment[] } | { error: string } {
  if (raw === undefined || raw === null) return { attachments: [] };
  if (!Array.isArray(raw) || raw.length > MAX_ATTACHMENTS) return { error: `You can attach up to ${MAX_ATTACHMENTS} files.` };
  const out: Attachment[] = [];
  let total = 0;
  for (const item of raw) {
    const a = (item ?? {}) as Record<string, unknown>;
    if (typeof a.name !== "string" || typeof a.text !== "string") return { error: "That attachment couldn't be read." };
    // names go inside a marker line, so keep them to one safe line
    const name = a.name.replace(/[\r\n\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "file";
    let text = a.text.trim();
    if (!text) return { error: `"${name}" has no readable text.` };
    if (text.length > MAX_ATTACHMENT_CHARS) text = `${text.slice(0, MAX_ATTACHMENT_CHARS)}\n[…the rest of this file was cut off]`;
    total += text.length;
    if (total > MAX_ATTACHMENTS_TOTAL_CHARS + 200) return { error: "Those files are too long to send together. Try fewer or shorter files." };
    out.push({ name, text });
  }
  return { attachments: out };
}

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
    express.json({ limit: "150kb" }),
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
    const { sessionId, message, attachments: rawAttachments } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
      res.status(400).json({ error: "Invalid session." });
      return;
    }
    const parsed = parseAttachments(rawAttachments);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { attachments } = parsed;
    let text = typeof message === "string" ? message.trim() : "";
    if (!text && attachments.length === 0) {
      res.status(400).json({ error: "Please type a message." });
      return;
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE_CHARS} characters.` });
      return;
    }

    // File text travels inside marker blocks so the chat page can show it as a chip when the history is reloaded.
    if (attachments.length > 0) {
      if (!text) text = "Please take a look at the attached file.";
      text += attachments.map((a) => `\n\n[[attachment: ${a.name}]]\n${a.text}\n[[/attachment]]`).join("");
    }

    const { reply, usedFallback } = await ankeeta.replySafe({
      platform: "web",
      userId: sessionId,
      text,
      channel: "web",
      maxInputChars: attachments.length > 0 ? MAX_COMBINED_CHARS : undefined,
    });
    res.json({ reply, usedFallback });
  });

  return router;
}
