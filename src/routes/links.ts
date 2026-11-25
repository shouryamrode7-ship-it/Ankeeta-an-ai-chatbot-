import { Router } from "express";
import type { Config } from "../config.js";

/** Only [A-Za-z0-9._-] are valid in these handles; reject anything else rather than guess. */
const SAFE_HANDLE = /^[A-Za-z0-9._%-]+$/;

export function createLinksRouter(config: Config): Router {
  const router = Router();

  // Opens the Instagram DM composer with Ankeeta (deep-links into the app on mobile).
  router.get("/ig", (_req, res) => {
    const u = config.instagram.username;
    if (!u || !SAFE_HANDLE.test(u)) {
      res.status(503).type("text/plain").send("Instagram link is not configured yet.");
      return;
    }
    res.redirect(302, `https://ig.me/m/${encodeURIComponent(u)}?ref=ig_link`);
  });

  // Links for LinkedIn and WhatsApp profiles/bios: open the live web chat in the visitor's browser.
  router.get("/li", (_req, res) => {
    res.redirect(302, "/chat?from=linkedin");
  });
  router.get("/wa", (_req, res) => {
    res.redirect(302, "/chat?from=whatsapp");
  });

  return router;
}

export function createHealthRouter(config: Config): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", bot: config.botName });
  });
  return router;
}
