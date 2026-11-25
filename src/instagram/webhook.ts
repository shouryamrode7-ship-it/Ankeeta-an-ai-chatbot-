import crypto from "node:crypto";
import express, { Router } from "express";
import type { Ankeeta } from "../ankeeta.js";
import type { Config } from "../config.js";
import { errMessage, log } from "../logger.js";
import type { ConversationStore } from "../memory/index.js";
import type { BackgroundQueue } from "../queue.js";
import type { InstagramSender } from "./graph.js";
import { verifySignature } from "./signature.js";

interface InstagramMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface InstagramWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; messaging?: InstagramMessagingEvent[] }>;
}

export interface InstagramWebhookDeps {
  config: Config;
  ankeeta: Ankeeta;
  store: ConversationStore;
  queue: BackgroundQueue;
  sender: InstagramSender;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createInstagramWebhookRouter(deps: InstagramWebhookDeps): Router {
  const { config, ankeeta, store, queue, sender } = deps;
  const router = Router();

  // Meta's one-time subscription handshake.
  router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const ok =
      mode === "subscribe" &&
      typeof token === "string" &&
      config.instagram.verifyToken !== "" &&
      safeEqual(token, config.instagram.verifyToken);

    if (ok && typeof challenge === "string") {
      res.status(200).type("text/plain").send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  // Raw body is required: the signature covers the exact bytes Meta sent.
  router.post("/", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
    if (!config.instagram.appSecret) {
      log.error("INSTAGRAM_APP_SECRET missing – rejecting webhook");
      res.sendStatus(503);
      return;
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifySignature(raw, req.header("x-hub-signature-256"), config.instagram.appSecret)) {
      log.warn("instagram webhook signature rejected");
      res.sendStatus(401);
      return;
    }

    let payload: InstagramWebhookPayload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.sendStatus(400);
      return;
    }

    // Acknowledge immediately; Meta retries (and eventually disables) slow webhooks.
    res.sendStatus(200);

    if (payload.object !== "instagram") return;

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const senderId = event.sender?.id;
        const text = event.message?.text;
        const mid = event.message?.mid;

        if (!senderId || typeof text !== "string" || !text.trim()) continue; // non-text / reactions / reads
        if (event.message?.is_echo) continue; // our own outgoing messages
        if (senderId === entry.id) continue; // messages sent by the bot's own account

        queue.run(`instagram:${senderId}`, async () => {
          if (mid && !(await store.markEventSeen(`instagram:${mid}`))) {
            log.debug("duplicate instagram event ignored", { mid });
            return;
          }

          const { reply } = await ankeeta.replySafe({
            platform: "instagram",
            userId: senderId,
            text,
            channel: "instagram",
          });

          try {
            await sender.sendText(senderId, reply);
          } catch (err) {
            log.error("failed to send instagram reply", { error: errMessage(err) });
          }
        });
      }
    }
  });

  return router;
}
