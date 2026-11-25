import type { Config } from "../config.js";

export interface InstagramSender {
  sendText(recipientId: string, text: string): Promise<void>;
}

export class InstagramGraphSender implements InstagramSender {
  constructor(
    private readonly cfg: Config["instagram"],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendText(recipientId: string, text: string): Promise<void> {
    if (!this.cfg.accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN is not configured");

    const url = `${this.cfg.graphBase}/${this.cfg.graphVersion}/me/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.accessToken}`,
      },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Instagram send failed with HTTP ${res.status}: ${detail}`);
    }
  }
}
