import crypto from "node:crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256` header ("sha256=<hex>") against the
 * exact raw request bytes, using the app secret. Constant-time comparison.
 */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!appSecret || !header) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!match?.[1]) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(match[1], "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/** Helper used by tests (and handy for local curl testing). */
export function signBody(rawBody: Buffer | string, appSecret: string): string {
  return `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}
