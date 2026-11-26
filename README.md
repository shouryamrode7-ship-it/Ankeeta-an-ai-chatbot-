# Ankeeta

> A friendly, talkative AI companion you can chat with right in your browser.

**Live demo:** https://ankeeta-an-ai-chatbot.onrender.com/chat
*(Free hosting: the first load after a quiet period can take up to a minute while the server wakes up.)*

A friendly, talkative AI companion (not a sales bot) that anyone can chat with in the browser. Put one link on any profile:

| Link | Opens |
|---|---|
| `https://YOUR-DOMAIN/chat` | The live chat with Ankeeta |
| `https://YOUR-DOMAIN/ig`, `/li`, `/wa` | The same chat, for your Instagram, LinkedIn and WhatsApp profiles |

Visitors need no account and no app. Ankeeta greets them first and remembers the conversation. Instagram DMs and (owner-only) WhatsApp DMs are **optional integrations** that stay off unless you configure them.

- Node.js 22.13+ / TypeScript / Express 5
- Conversation memory: last 15 messages per `(platform, user)` in SQLite via Node's built-in `node:sqlite` (no native build tools needed; or Redis if `REDIS_URL` is set)
- LLM: Anthropic by default; any OpenAI-compatible API via `LLM_PROVIDER=openai`
- Channel-aware tone: warm and chatty on the web, playful on Instagram, polished on LinkedIn

## Highlights

- **Web chat with memory:** each visitor gets their own conversation. Ankeeta greets first and remembers the last 15 messages (SQLite via Node's built-in `node:sqlite`, or Redis).
- **Provider-agnostic LLM client:** Anthropic or any OpenAI-compatible API (for example Google Gemini's free tier), with timeouts and automatic retries on temporary errors.
- **Persona and guardrails:** always says it is an AI when asked, never pushes products or links, avoids medical, legal and financial advice, and responds with care if someone seems in distress. Tone adapts per channel.
- **Safe by default:** rate limiting and input caps on the public chat, secrets only in environment variables, logs never contain message text.
- **Optional integrations:** Instagram DMs and owner-only WhatsApp DMs through Meta webhooks with HMAC signature verification and duplicate-event protection, plus a compliant LinkedIn draft helper.
- **Tested and deployable:** 111 automated tests (Vitest and Supertest), Docker image, one-click Render blueprint.

**Stack:** Node.js 22, TypeScript, Express 5.

## Endpoints

| Route | What it does |
|---|---|
| `GET /` | Small landing page with a "Chat with Ankeeta" button |
| `GET /chat` | Live web chat: anyone can talk to Ankeeta directly in the browser (no account needed) |
| `GET /ig`, `/li`, `/wa` | 302 → `/chat?from=<source>` (same web chat; `from` just labels where the visitor came from) |
| `GET /health` | `{ "status": "ok", "bot": "Ankeeta" }` |
| `GET/POST /webhook/instagram` | *Optional.* Meta verification and incoming Instagram DMs (signature-checked) |
| `GET/POST /webhook/whatsapp` | *Optional.* Meta verification and incoming WhatsApp DMs (signature-checked, **owner-only**) |
| `POST /api/linkedin/draft-reply` | *Optional.* Draft a reply to a LinkedIn message for you to copy (needs `ADMIN_API_KEY`) |
| `GET /linkedin` | *Optional.* Small web UI for the draft endpoint |
| `/webhook/linkedin` | Returns 501 unless you plug in an approved LinkedIn Partner adapter |

## 1. Run locally and test

```bash
npm install
cp .env.example .env      # fill in values (LLM_API_KEY is enough to try the LinkedIn drafter)
npm run dev               # http://localhost:3000
npm test                  # 111 tests, no network or API keys needed
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

## 2. Optional: Instagram DMs (Meta Developer App)

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

## 2b. Optional: WhatsApp DMs (owner-only)

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

## 3. Deploy with HTTPS (web chat needs only `LLM_API_KEY` and friends)

Any container host works; Render and Railway are preconfigured. Both give you an HTTPS URL automatically.

**Render**
1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → select the repo (`render.yaml` is picked up).
3. Fill in the prompted secret `LLM_API_KEY`. (Instagram/WhatsApp variables are only needed if you enable those optional integrations.)
4. The blueprint attaches a 1 GB disk at `/data` for SQLite memory. That needs a paid plan. On the free plan, remove the `disk` block and `plan: starter`, and set `REDIS_URL` (e.g. a Render Key Value or Upstash instance) so memory survives restarts.
5. Add your custom domain under *Settings → Custom Domains* if you want a short share link.

**Railway**: New Project → Deploy from GitHub (`railway.json` uses the Dockerfile). Add the variables from `.env.example`, then add a Redis plugin and set `REDIS_URL`, or mount a volume at `/data`. Generate a domain under *Settings → Networking*.

**Docker anywhere**
```bash
docker build -t ankeeta .
docker run -p 3000:3000 --env-file .env -v ankeeta-data:/data ankeeta
```
Put it behind a TLS-terminating proxy (Caddy, nginx, Cloudflare). Meta requires HTTPS.

Put `https://YOUR-DOMAIN/ig` on Instagram, `/li` on LinkedIn and `/wa` on WhatsApp (or just `/chat` everywhere). All of them open the web chat.

## Live web chat

`/chat` is a built-in chat window: anyone with the link talks to Ankeeta directly, with her opening greeting and memory per browser. It's public, so it is rate limited to 20 requests per minute per IP and messages are capped at 1000 characters to keep LLM costs bounded.

## Opening greeting

When a brand-new chat starts with just "hi" / "hey" / "Hi Ankeeta! 👋" (which is what the `/wa` link pre-fills), Ankeeta replies with her signature line instead of calling the LLM: *"Heyy! 😊 I’m Ankeeta, and I’m always up for a good conversation. Tell me how your day is going."* Change it with `GREETING_MESSAGE` (empty disables it). On LinkedIn she can't message first, so the `/linkedin` page has a **Get opening greeting** button that gives you the line to paste.

## LinkedIn (optional draft helper)

LinkedIn visitors use the web chat (`/li`). LinkedIn restricts its Messaging API to approved partners and prohibits unauthorised DM bots on personal accounts, so Ankeeta never logs in to or automates LinkedIn DMs. If you still want help replying to people who message you on LinkedIn yourself:

1. Copy an incoming message, then use `/linkedin` (web UI), `POST /api/linkedin/draft-reply`, or `npm run draft`.
2. Review the draft and paste it into LinkedIn yourself.
3. Pass a `threadId` to keep context across messages, and optionally `context` (`[{ "role": "them" | "me", "text": "..." }]`) to seed a thread from earlier messages. Note that stored memory contains the drafts, not necessarily what you finally sent.

If you later become an approved LinkedIn partner, implement `LinkedInPartnerAdapter` (`src/linkedin/partnerAdapter.ts`) and pass it to `createApp` in `src/index.ts` to activate `/webhook/linkedin`.

## Configuration reference

See `.env.example`. **Web chat only needs `LLM_API_KEY`** (plus `LLM_PROVIDER`, `LLM_BASE_URL` and `LLM_MODEL` if you don't use Anthropic). Optional Instagram DMs need `INSTAGRAM_VERIFY_TOKEN`, `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_APP_SECRET`. Optional owner-only WhatsApp DMs need `WHATSAPP_ALLOWED_NUMBERS`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and an app secret. The server logs a warning only for an integration that is partly configured.

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

## License

MIT, see [LICENSE](LICENSE).
