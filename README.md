# Ankeeta

A friendly, talkative AI companion (not a sales bot). One domain, three links you put on your profiles:

| Where you put the link | Link | What a visitor gets |
|---|---|---|
| Instagram bio | `https://YOUR-DOMAIN/ig` | Opens **Instagram DMs** with Ankeeta (anyone can chat) |
| LinkedIn profile | `https://YOUR-DOMAIN/li` | Opens the **web chat** in their browser |
| WhatsApp (status/bio/messages) | `https://YOUR-DOMAIN/wa` | Opens the **web chat** in their browser |

Separately, **your own WhatsApp DMs with Ankeeta are owner-only**: only the number(s) in `WHATSAPP_ALLOWED_NUMBERS` get answers; every other number is ignored.

- Node.js 22.13+ / TypeScript / Express 5
- Conversation memory: last 15 messages per `(platform, user)` in SQLite via Node's built-in `node:sqlite` (no native build tools needed; or Redis if `REDIS_URL` is set)
- LLM: Anthropic by default; any OpenAI-compatible API via `LLM_PROVIDER=openai`
- Channel-aware tone: playful and short on Instagram, warm and chatty on WhatsApp, polished on LinkedIn

## Endpoints

| Route | What it does |
|---|---|
| `GET /` | Small landing page with "Chat right here" and "Chat on Instagram" buttons |
| `GET /chat` | Live web chat: anyone can talk to Ankeeta directly in the browser (no account needed) |
| `GET /ig` | 302 → `https://ig.me/m/<INSTAGRAM_USERNAME>?ref=ig_link` (opens Instagram DMs on mobile) |
| `GET /wa` | 302 → `/chat?from=whatsapp` (web chat in the browser) |
| `GET /li` | 302 → `/chat?from=linkedin` (web chat in the browser) |
| `GET /health` | `{ "status": "ok", "bot": "Ankeeta" }` |
| `GET/POST /webhook/instagram` | Meta verification handshake and incoming DMs (signature-checked) |
| `GET/POST /webhook/whatsapp` | Meta verification handshake and incoming WhatsApp DMs (signature-checked, **owner-only**) |
| `POST /api/linkedin/draft-reply` | *Optional.* Draft a reply to a LinkedIn message for you to copy (needs `ADMIN_API_KEY`) |
| `GET /linkedin` | *Optional.* Small web UI for the draft endpoint |
| `/webhook/linkedin` | Returns 501 unless you plug in an approved LinkedIn Partner adapter |

## 1. Run locally and test

```bash
npm install
cp .env.example .env      # fill in values (LLM_API_KEY is enough to try the LinkedIn drafter)
npm run dev               # http://localhost:3000
npm test                  # 77 tests, no network or API keys needed
npm run typecheck && npm run build
```

Try it:

```bash
curl localhost:3000/health
curl -i localhost:3000/ig
# LinkedIn drafting (needs ADMIN_API_KEY and LLM_API_KEY in .env)
curl -X POST localhost:3000/api/linkedin/draft-reply \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"message":"Hi! Loved your post about hiking.","threadId":"priya"}'
# or the CLI
npm run draft -- --thread priya "Hi! Loved your post about hiking."
```

To test the Instagram webhook locally, expose your port with an HTTPS tunnel (e.g. `ngrok http 3000`) and use that URL in Meta's dashboard.

## 2. Configure the Instagram webhook (Meta Developer App)

Prerequisites: an Instagram **professional** (Business or Creator) account.

1. Go to [developers.facebook.com](https://developers.facebook.com) → **Create App** → use case **Other / Business**, and add the **Instagram** product (Instagram API with Instagram login → *API setup*).
2. Under *Generate access tokens*, add your Instagram account and generate a token. Put it in `INSTAGRAM_ACCESS_TOKEN`. (Long-lived tokens expire after ~60 days; refresh them before then.)
3. **App settings → Basic**: copy the **App Secret** into `INSTAGRAM_APP_SECRET`.
4. Choose any random string for `INSTAGRAM_VERIFY_TOKEN`.
5. Deploy Ankeeta first (below) so the webhook URL is reachable over HTTPS.
6. In *Configure webhooks* set:
   - **Callback URL:** `https://YOUR-DOMAIN/webhook/instagram`
   - **Verify token:** the same value as `INSTAGRAM_VERIFY_TOKEN`
   
   Click **Verify and save**. Meta calls `GET /webhook/instagram` and Ankeeta echoes the challenge.
7. Subscribe to the **`messages`** webhook field for your Instagram account.
8. While the app is in **Development mode**, only people with a role on the app (add them as testers) can message the bot. For everyone else, complete App Review for `instagram_business_manage_messages` and switch the app to **Live**.
9. Message your account from a tester profile — Ankeeta should answer within a few seconds.

Note: Instagram only lets a business reply within 24 hours of the user's last message, which suits a chat companion.

Security notes: every POST is checked against `X-Hub-Signature-256` using `INSTAGRAM_APP_SECRET` (fails closed if unset), redelivered events are ignored, and the server returns 200 immediately and replies in the background.

## 2b. Configure WhatsApp DMs (owner-only)

This is only for **you** chatting with Ankeeta in WhatsApp. Visitors who tap the `/wa` link go to the web chat instead, so they never need WhatsApp.

Ankeeta answers through the **WhatsApp Business Cloud API**. A normal personal WhatsApp number can't run a bot, so Ankeeta needs her own Cloud API number (Meta's free test number works for this), and you message that number from your personal WhatsApp.

1. In the Meta app (same one as Instagram, or a new one) add the **WhatsApp** product. Meta provides a free test number to start with.
2. Copy the **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.
3. Create a permanent token: *Business Settings → System users* → add a system user, assign the WhatsApp account, generate a token with `whatsapp_business_messaging`. Put it in `WHATSAPP_ACCESS_TOKEN`. (The temporary token on the API Setup page expires in 24 hours.)
4. Set `WHATSAPP_ALLOWED_NUMBERS` to **your own** WhatsApp number: country code first, digits only (e.g. `919876543210`). Comma-separate to allow more. Messages from any other number are ignored and never answered. If left empty, nobody is answered.
5. Choose any random `WHATSAPP_VERIFY_TOKEN`. The App Secret is reused from `INSTAGRAM_APP_SECRET`; set `WHATSAPP_APP_SECRET` only if WhatsApp lives in a different Meta app.
6. *WhatsApp > Configuration → Webhook*: Callback URL `https://YOUR-DOMAIN/webhook/whatsapp`, verify token as above, then subscribe to the **`messages`** field.
7. In test mode, add your phone as an allowed recipient, then message the test number from it.

Notes: WhatsApp lets a business send free-form replies only within **24 hours** of your last message. Ankeeta never starts conversations.

## 3. Deploy with HTTPS

Any container host works; Render and Railway are preconfigured. Both give you an HTTPS URL automatically.

**Render**
1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → select the repo (`render.yaml` is picked up).
3. Fill in the prompted secrets: `INSTAGRAM_USERNAME`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET`, `LLM_API_KEY`, and for WhatsApp `WHATSAPP_ALLOWED_NUMBERS`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. `INSTAGRAM_VERIFY_TOKEN` and `ADMIN_API_KEY` are generated; read them in the dashboard.
4. The blueprint attaches a 1 GB disk at `/data` for SQLite memory. That needs a paid plan. On the free plan, remove the `disk` block and `plan: starter`, and set `REDIS_URL` (e.g. a Render Key Value or Upstash instance) so memory survives restarts.
5. Add your custom domain under *Settings → Custom Domains* if you want a short share link.

**Railway**: New Project → Deploy from GitHub (`railway.json` uses the Dockerfile). Add the variables from `.env.example`, then add a Redis plugin and set `REDIS_URL`, or mount a volume at `/data`. Generate a domain under *Settings → Networking*.

**Docker anywhere**
```bash
docker build -t ankeeta .
docker run -p 3000:3000 --env-file .env -v ankeeta-data:/data ankeeta
```
Put it behind a TLS-terminating proxy (Caddy, nginx, Cloudflare). Meta requires HTTPS.

Put these links on your profiles: `https://YOUR-DOMAIN/ig` on Instagram, `https://YOUR-DOMAIN/li` on LinkedIn, `https://YOUR-DOMAIN/wa` on WhatsApp. (`https://YOUR-DOMAIN/chat` is the web chat itself, and `https://YOUR-DOMAIN/` is a small landing page.)

## Live web chat

`/chat` is a built-in chat window: anyone with the link talks to Ankeeta directly, with her opening greeting and memory per browser. It's public, so it is rate limited to 20 requests per minute per IP and messages are capped at 1000 characters to keep LLM costs bounded.

## Opening greeting

When a brand-new chat starts with just "hi" / "hey" / "Hi Ankeeta! 👋" (which is what the `/wa` link pre-fills), Ankeeta replies with her signature line instead of calling the LLM: *"Heyy! 😊 I’m Ankeeta, and I’m always up for a good conversation. Tell me how your day is going."* Change it with `GREETING_MESSAGE` (empty disables it). On LinkedIn she can't message first, so the `/linkedin` page has a **Get opening greeting** button that gives you the line to paste.

## LinkedIn (optional draft helper)

Visitors from LinkedIn use the web chat (`/li`). LinkedIn restricts its Messaging API to approved partners and prohibits unauthorised DM bots on personal accounts, so Ankeeta never logs in to or automates LinkedIn DMs. If you still want help replying to people who message you on LinkedIn yourself:

1. Copy an incoming message, then use `/linkedin` (web UI), `POST /api/linkedin/draft-reply`, or `npm run draft`.
2. Review the draft and paste it into LinkedIn yourself.
3. Pass a `threadId` to keep context across messages, and optionally `context` (`[{ "role": "them" | "me", "text": "..." }]`) to seed a thread from earlier messages. Note that stored memory contains the drafts, not necessarily what you finally sent.

If you later become an approved LinkedIn partner, implement `LinkedInPartnerAdapter` (`src/linkedin/partnerAdapter.ts`) and pass it to `createApp` in `src/index.ts` to activate `/webhook/linkedin`.

## Configuration reference

See `.env.example`. Required for owner-only WhatsApp DMs: `WHATSAPP_ALLOWED_NUMBERS`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. The web chat, `/li` and `/wa` need only `LLM_API_KEY`. Required for the full Instagram flow: `INSTAGRAM_USERNAME`, `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET`, `LLM_API_KEY`, `LLM_MODEL`. The server starts and logs warnings for anything missing; the affected routes answer 503 rather than misbehaving.

## Persona and guardrails

Defined in `src/persona.ts` and injected on every call together with the channel. Ankeeta says it is an AI when asked, never promotes products or shares links, declines medical/legal/financial advice, keeps things respectful, and responds with care if someone seems in distress. Logs never contain message text.

## Project layout

```
src/app.ts          routes + security middleware     src/ankeeta.ts   history → LLM → save
src/instagram/      signature, Graph sender, webhook src/llm.ts       Anthropic / OpenAI-compatible
src/linkedin/       draft API + partner adapter      src/whatsapp/    Cloud API sender + webhook
src/persona.ts      system prompt per channel        src/memory/      SQLite + Redis stores
tests/              vitest + supertest
```
