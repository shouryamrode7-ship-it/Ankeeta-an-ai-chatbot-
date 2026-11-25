import { DEFAULT_GREETING } from "./persona.js";

export interface Config {
  port: number;
  botName: string;
  /** First reply to a brand-new chat that starts with just "hi". Empty disables it. */
  greeting: string;
  instagram: {
    username: string;
    verifyToken: string;
    accessToken: string;
    appSecret: string;
    graphBase: string;
    graphVersion: string;
  };
  whatsapp: {
    /**
     * Only these WhatsApp numbers (international format, digits only, e.g. 919876543210)
     * may chat with Ankeeta on WhatsApp. Everyone else is ignored. Empty = nobody.
     */
    allowedNumbers: string[];
    verifyToken: string;
    accessToken: string;
    /** Falls back to INSTAGRAM_APP_SECRET – both usually belong to the same Meta app. */
    appSecret: string;
    /** Phone number ID from the WhatsApp Cloud API dashboard (not the phone number itself). */
    phoneNumberId: string;
    graphBase: string;
    graphVersion: string;
  };
  linkedin: {
    /** Protects /api/linkedin/draft-reply. If empty the endpoint is disabled. */
    adminApiKey: string;
  };
  llm: {
    provider: "anthropic" | "openai";
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
  };
  memory: {
    historyLimit: number;
    databasePath: string;
    redisUrl: string;
  };
}

type Env = Record<string, string | undefined>;

function str(env: Env, key: string, fallback = ""): string {
  return (env[key] ?? fallback).trim();
}

function int(env: Env, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} must be a positive integer (got "${raw}")`);
  }
  return n;
}

/** Strip a leading "@" or accidental URL prefix so INSTAGRAM_USERNAME=@me works. */
function handle(value: string, urlPrefixes: RegExp): string {
  return value.replace(urlPrefixes, "").replace(/^@/, "").replace(/\/+$/, "");
}

export function loadConfig(env: Env = process.env): Config {
  const provider = str(env, "LLM_PROVIDER", "anthropic").toLowerCase();
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(`LLM_PROVIDER must be "anthropic" or "openai" (got "${provider}")`);
  }

  return {
    port: int(env, "PORT", 3000),
    botName: "Ankeeta",
    greeting: str(env, "GREETING_MESSAGE", DEFAULT_GREETING),
    instagram: {
      username: handle(str(env, "INSTAGRAM_USERNAME"), /^https?:\/\/(www\.)?instagram\.com\//i),
      verifyToken: str(env, "INSTAGRAM_VERIFY_TOKEN"),
      accessToken: str(env, "INSTAGRAM_ACCESS_TOKEN"),
      appSecret: str(env, "INSTAGRAM_APP_SECRET"),
      graphBase: str(env, "INSTAGRAM_GRAPH_BASE", "https://graph.instagram.com").replace(/\/+$/, ""),
      graphVersion: str(env, "INSTAGRAM_GRAPH_VERSION", "v23.0"),
    },
    whatsapp: {
      allowedNumbers: str(env, "WHATSAPP_ALLOWED_NUMBERS")
        .split(",")
        .map((n) => n.replace(/\D/g, ""))
        .filter(Boolean),
      verifyToken: str(env, "WHATSAPP_VERIFY_TOKEN"),
      accessToken: str(env, "WHATSAPP_ACCESS_TOKEN"),
      appSecret: str(env, "WHATSAPP_APP_SECRET") || str(env, "INSTAGRAM_APP_SECRET"),
      phoneNumberId: str(env, "WHATSAPP_PHONE_NUMBER_ID"),
      graphBase: str(env, "WHATSAPP_GRAPH_BASE", "https://graph.facebook.com").replace(/\/+$/, ""),
      graphVersion: str(env, "WHATSAPP_GRAPH_VERSION", "v23.0"),
    },
    linkedin: {
      adminApiKey: str(env, "ADMIN_API_KEY"),
    },
    llm: {
      provider,
      apiKey: str(env, "LLM_API_KEY"),
      model: str(env, "LLM_MODEL", provider === "anthropic" ? "claude-haiku-5-5" : "gpt-4o-mini"),
      baseUrl: str(
        env,
        "LLM_BASE_URL",
        provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1",
      ).replace(/\/+$/, ""),
      timeoutMs: int(env, "LLM_TIMEOUT_MS", 20_000),
    },
    memory: {
      historyLimit: int(env, "HISTORY_LIMIT", 15),
      databasePath: str(env, "DATABASE_PATH", "./data/ankeeta.db"),
      redisUrl: str(env, "REDIS_URL"),
    },
  };
}

/** Human-readable list of problems that would stop the bot from working in production. */
export function configWarnings(config: Config): string[] {
  const warnings: string[] = [];
  if (!config.llm.apiKey) warnings.push("LLM_API_KEY is not set – Ankeeta cannot generate replies.");
  if (!config.instagram.username) warnings.push("INSTAGRAM_USERNAME is not set – /ig will return 503.");
  if (!config.instagram.verifyToken) warnings.push("INSTAGRAM_VERIFY_TOKEN is not set – webhook verification will fail.");
  if (!config.instagram.appSecret) warnings.push("INSTAGRAM_APP_SECRET is not set – incoming Instagram webhooks will be rejected.");
  if (!config.instagram.accessToken) warnings.push("INSTAGRAM_ACCESS_TOKEN is not set – Ankeeta cannot send Instagram replies.");
  if (config.whatsapp.allowedNumbers.length === 0)
    warnings.push("WHATSAPP_ALLOWED_NUMBERS is not set – Ankeeta will ignore every WhatsApp DM (it is owner-only).");
  if (!config.whatsapp.verifyToken) warnings.push("WHATSAPP_VERIFY_TOKEN is not set – WhatsApp webhook verification will fail.");
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId)
    warnings.push("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set – Ankeeta cannot send WhatsApp replies.");
  if (!config.whatsapp.appSecret) warnings.push("No app secret for WhatsApp (WHATSAPP_APP_SECRET) – incoming WhatsApp webhooks will be rejected.");
  if (!config.linkedin.adminApiKey) warnings.push("ADMIN_API_KEY is not set – LinkedIn draft-reply endpoint is disabled.");
  return warnings;
}
