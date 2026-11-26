import { Router } from "express";
import type { Config } from "../config.js";

export function createLinksRouter(config: Config): Router {
  const router = Router();

  // Profile links. Every platform sends visitors to the same web chat; ?from= just labels the source.
  for (const [route, from] of [["/ig", "instagram"], ["/li", "linkedin"], ["/wa", "whatsapp"]] as const) {
    router.get(route, (_req, res) => {
      res.redirect(302, `/chat?from=${from}`);
    });
  }

  return router;
}

export function createHealthRouter(config: Config): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", bot: config.botName });
  });
  return router;
}
