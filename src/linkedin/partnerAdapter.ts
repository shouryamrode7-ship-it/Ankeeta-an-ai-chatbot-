import type { IncomingHttpHeaders } from "node:http";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LinkedIn Partner API adapter  (OPTIONAL – NOT ENABLED BY DEFAULT)
 * ─────────────────────────────────────────────────────────────────────────────
 * LinkedIn restricts its Messaging APIs to approved partners and prohibits
 * automated DM bots on personal accounts. Ankeeta therefore does NOT send or
 * read LinkedIn messages on its own: use `POST /api/linkedin/draft-reply` and
 * copy/paste the draft yourself.
 *
 * If you are later approved for a LinkedIn partner program with messaging
 * access, implement this interface against the API/webhook format LinkedIn
 * gives you and pass the instance to `createApp({ linkedinAdapter })` in
 * `src/index.ts`. Until then `/webhook/linkedin` answers 501.
 */

export interface LinkedInIncomingMessage {
  /** Stable id of the other participant (used as the memory key). */
  senderId: string;
  /** Unique message id, used to ignore webhook redeliveries. */
  messageId: string;
  text: string;
}

export interface LinkedInPartnerAdapter {
  /** Verify the authenticity of a webhook call (signature, shared secret, ...). */
  verifyRequest(rawBody: Buffer, headers: IncomingHttpHeaders): boolean;
  /** Turn LinkedIn's webhook payload into plain incoming text messages (ignore everything else). */
  parseEvents(body: unknown): LinkedInIncomingMessage[];
  /** Deliver Ankeeta's reply using your approved credentials. */
  sendMessage(recipientId: string, text: string): Promise<void>;
}
