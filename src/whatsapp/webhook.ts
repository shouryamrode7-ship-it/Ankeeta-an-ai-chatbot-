import crypto from "node:crypto";
import express, { Router } from "express";
import type { Ankeeta } from "../ankeeta.js";
import type { Config } from "../config.js";
import { errMessage, log } from "../logger.js";
import type { ConversationStore } from "../memory/index.js";
import { verifySignature } from "../instagram/signature.js"; // same Meta X-Hub-Signature-256 scheme
import type { BackgroundQueue } from "../queue.js";
import type { WhatsAppSender } from "./graph.js";

interface WhatsAppMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface WhatsAppPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: WhatsAppMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

export interface WhatsAppWebhookDeps {
  config: Config;
  ankeeta: Ankeeta;
  store: ConversationStore;
  queue: BackgroundQueue;
  sender: WhatsAppSender;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createWhatsAppWebhookRouter(deps: WhatsAppWebhookDeps): Router {
  const { config, ankeeta, store, queue, sender } = deps;
  const router = Router();

  router.get("/", (req, res) => {
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const ok =
      req.query["hub.mode"] === "subscribe" &&
      typeof token === "string" &&
      config.whatsapp.verifyToken !== "" &&
      safeEqual(token, config.whatsapp.verifyToken);

    if (ok && typeof challenge === "string") {
      res.status(200).type("text/plain").send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  router.post("/", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
    if (!config.whatsapp.appSecret) {
      log.error("WhatsApp app secret missing – rejecting webhook");
      res.sendStatus(503);
      return;
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifySignature(raw, req.header("x-hub-signature-256"), config.whatsapp.appSecret)) {
      log.warn("whatsapp webhook signature rejected");
      res.sendStatus(401);
      return;
    }

    let payload: WhatsAppPayload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.sendStatus(400);
      return;
    }

    res.sendStatus(200); // acknowledge fast; reply in the background

    if (payload.object !== "whatsapp_business_account") return;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // Delivery/read receipts arrive as `statuses` (no `messages`) and are ignored here.
        for (const msg of change.value?.messages ?? []) {
          const from = msg.from;
          const text = msg.text?.body;
          if (!from || msg.type !== "text" || typeof text !== "string" || !text.trim()) continue;

          // Owner-only: ignore (and never answer) anyone who isn't on the allowlist.
          if (!config.whatsapp.allowedNumbers.includes(from.replace(/\D/g, ""))) {
            log.warn("whatsapp message from a number that is not allowed was ignored");
            continue;
          }

          queue.run(`whatsapp:${from}`, async () => {
            if (msg.id && !(await store.markEventSeen(`whatsapp:${msg.id}`))) return;

            const { reply } = await ankeeta.replySafe({
              platform: "whatsapp",
              userId: from,
              text,
              channel: "whatsapp",
            });

            try {
              await sender.sendText(from, reply);
            } catch (err) {
              log.error("failed to send whatsapp reply", { error: errMessage(err) });
            }
          });
        }
      }
    }
  });

  return router;
}
