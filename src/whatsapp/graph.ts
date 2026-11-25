import type { Config } from "../config.js";

export interface WhatsAppSender {
  sendText(to: string, text: string): Promise<void>;
}

/** WhatsApp Business Cloud API: POST /{phone-number-id}/messages */
export class WhatsAppCloudSender implements WhatsAppSender {
  constructor(
    private readonly cfg: Config["whatsapp"],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendText(to: string, text: string): Promise<void> {
    if (!this.cfg.accessToken || !this.cfg.phoneNumberId) {
      throw new Error("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured");
    }
    const url = `${this.cfg.graphBase}/${this.cfg.graphVersion}/${encodeURIComponent(this.cfg.phoneNumberId)}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.accessToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`WhatsApp send failed with HTTP ${res.status}: ${detail}`);
    }
  }
}
