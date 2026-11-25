import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import type { Ankeeta } from "./ankeeta.js";
import type { Config } from "./config.js";
import type { InstagramSender } from "./instagram/graph.js";
import { createInstagramWebhookRouter } from "./instagram/webhook.js";
import type { LinkedInPartnerAdapter } from "./linkedin/partnerAdapter.js";
import { createLinkedInApiRouter, createLinkedInWebhookRouter } from "./linkedin/routes.js";
import { errMessage, log } from "./logger.js";
import type { ConversationStore } from "./memory/index.js";
import type { BackgroundQueue } from "./queue.js";
import type { WhatsAppSender } from "./whatsapp/graph.js";
import { createWhatsAppWebhookRouter } from "./whatsapp/webhook.js";
import { createWebChatRouter } from "./web/routes.js";
import { createHealthRouter, createLinksRouter } from "./routes/links.js";

export interface AppDeps {
  config: Config;
  ankeeta: Ankeeta;
  store: ConversationStore;
  queue: BackgroundQueue;
  instagramSender: InstagramSender;
  whatsappSender: WhatsAppSender;
  /** Only provide once you have approved LinkedIn Partner API access. */
  linkedinAdapter?: LinkedInPartnerAdapter;
}

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

export function createApp(deps: AppDeps): Express {
  const { config } = deps;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render/Railway/Fly terminate TLS in front of us
  app.use(helmet());

  app.use(createHealthRouter(config));
  app.use(createLinksRouter(config));

  app.use(
    "/webhook/instagram",
    createInstagramWebhookRouter({
      config,
      ankeeta: deps.ankeeta,
      store: deps.store,
      queue: deps.queue,
      sender: deps.instagramSender,
    }),
  );

  app.use(
    "/webhook/whatsapp",
    createWhatsAppWebhookRouter({
      config,
      ankeeta: deps.ankeeta,
      store: deps.store,
      queue: deps.queue,
      sender: deps.whatsappSender,
    }),
  );

  app.use("/api/chat", createWebChatRouter({ ankeeta: deps.ankeeta }));

  const linkedinDeps = {
    config,
    ankeeta: deps.ankeeta,
    store: deps.store,
    queue: deps.queue,
    linkedinAdapter: deps.linkedinAdapter,
  };
  app.use("/webhook/linkedin", createLinkedInWebhookRouter(linkedinDeps));
  app.use("/api/linkedin", createLinkedInApiRouter(linkedinDeps));

  // Landing page (/) and the LinkedIn draft helper UI (/linkedin).
  app.get("/linkedin", (_req, res) => {
    res.sendFile("linkedin.html", { root: PUBLIC_DIR });
  });
  app.use(express.static(PUBLIC_DIR, { index: "index.html", extensions: ["html"] }));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) log.error("unhandled error", { error: errMessage(err) });
    res.status(status).json({ error: status === 500 ? "Internal server error" : "Bad request" });
  };
  app.use(onError);

  return app;
}
