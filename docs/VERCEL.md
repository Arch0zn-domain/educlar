# EduClar and Jelly on Vercel

Jelly is part of this Next.js application: its interface and `/api/chat` deploy together. It supports a real FreeLLMAPI gateway through its OpenAI-compatible `/v1/chat/completions` API. Locally, use the gateway's API port (normally 3001), not its Vite dashboard port (5173).

## Choose the AI backend

**Single Vercel deployment:** set `GEMINI_API_KEY` and leave `FREELLMAPI_BASE_URL` and `FREELLMAPI_API_KEY` unset. The Next.js function calls Gemini directly. The default model is `gemini-2.5-flash-lite`; use `GEMINI_MODEL` to change it. This deploys the site, chatbot backend and cache together, but does not include FreeLLMAPI's provider dashboard or router.

**Use the full FreeLLMAPI router:** host the existing gateway on a persistent Node/Docker host with HTTPS, then set `FREELLMAPI_BASE_URL=https://your-gateway.example/v1`, `FREELLMAPI_API_KEY` to its unified key, and optionally `FREELLMAPI_MODEL=auto:fast`. EduClar calls it server-side. Its admin dashboard and provider keys are not exposed through EduClar. FreeLLMAPI's SQLite database, encryption key and background jobs need persistent hosting; uploading the unmodified gateway as a second Vercel project does not provide that. See the [upstream installation guide](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md).

`localhost` on Vercel is the Vercel function itself, so it cannot reach your computer's gateway. Configured gateway errors do not silently fall back to another paid provider.

## Configure the Vercel project

1. Import this GitHub repository into Vercel as a Next.js project. Use Node.js 22 or 24.
2. Connect a persistent PostgreSQL database. Use a **direct/unpooled connection URL** for `DATABASE_URL`: initialization uses a session advisory lock on a pinned connection. Do not use a transaction-pooling PgBouncer endpoint. Accounts, sessions, cache, limits and encrypted demo documents live in PostgreSQL. PGlite remains the local default.
3. Set the following server-side environment variables for the environment you deploy:

| Variable | Value |
| --- | --- |
| `APP_MODE` | `demo` |
| `BETTER_AUTH_URL` | The exact HTTPS deployment/domain URL used in the browser |
| `DATABASE_URL` | Direct PostgreSQL connection URL, including its required TLS parameters |
| `BETTER_AUTH_SECRET` | Independent random secret, at least 32 characters |
| `DOCUMENT_KEY` | Independent random key, exactly 64 hexadecimal characters |
| AI backend | The Gemini key or hosted FreeLLMAPI variables described above |

Generate each secret independently, locally, with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Enter them in Vercel's Environment Variables settings. Never commit `.env.local`, a SQLite database, provider credentials or `.data/`.

4. Deploy and visit `/asistent`. Sign in with one of the displayed fictional demo accounts. Hosted demo accepts only those fixed phone numbers and displays simulated codes; it sends no SMS. These demo identities, including the admin role, are deliberately shared and are unsuitable for real private data. Use Vercel deployment protection for a private demonstration if needed.
5. Keep a stable domain/alias and match `BETTER_AUTH_URL` to it. A changing preview URL needs its own matching configuration. Use separate databases and independent secrets for environments that should not share demo state.

First startup serializes migrations, seeding and the official-data snapshot import across instances. The SQL migrations and aggregate snapshot are explicitly included in Next.js output tracing. The initial database import can take longer than later requests; initialize it before a demonstration, using `npm run db:check` with the same deployment environment variables.

`APP_MODE=live` still refuses to start. The hosted mode is a demonstration of the existing prototype, with simulated authentication and fictional operator details.

## How token savings work

- Exact identical requests within the same account reuse a saved reply for 24 hours by default. The full sent history, system prompt/date, model, provider URL, key fingerprint and output limit affect the cache key. Different accounts never share replies. Similar questions with different wording or conversation context are new requests.
- Replies are encrypted with an application-specific key derived from `BETTER_AUTH_SECRET`. Raw prompts are not stored in the cache. Changing that secret invalidates existing sessions and cached replies. Clearing Jelly deletes the account's saved replies; reloading clears the visible conversation.
- A SQL lease prevents simultaneous identical requests across instances from making duplicate upstream calls. A duplicate still in progress returns 409; the UI keeps the draft for a manual retry.
- Default limits are 20 new requests per account per UTC day, 100 across the deployment per UTC day, and 30 requests per account per minute. Cache hits use the minute limit but do not use the daily allowance. Daily reservations are atomic and shared across instances. Failed provider attempts count conservatively because an upstream request may still consume tokens. There are no automatic retries in EduClar; the gateway may perform its own provider failover.
- Each user message is limited to 2,000 characters. Only the latest four conversation pairs are sent, and the total sent conversation is limited to 8,000 characters. Answers request at most 768 output tokens by default. Character limits are not precise input-token counts, and provider accounting can vary.
- Cache entries expire after the configured TTL. Expired replies are never served and are physically removed on the next chat request; usage buckets older than 35 days are also removed then.

Optional settings: `CHAT_CACHE_TTL_SECONDS` (default 86400, max 604800), `CHAT_MAX_OUTPUT_TOKENS` (default 768, max 2048), `CHAT_DAILY_LIMIT` (default 20, max 1000), `CHAT_GLOBAL_DAILY_LIMIT` (default 100, max 10000). All require positive integers. Keep provider-side spending limits in the provider dashboard as well.

## Verification

Run `npm run typecheck`, `npm test` and `npm run build`. The assistant tests cover encrypted persistent cache reuse, full-context keys, expiry, isolation, concurrent duplicate suppression, atomic shared budgets, failure accounting, validation, sign-in and same-origin protection. To verify the UI without spending tokens, run the `assistant.spec.ts` browser scenarios; they intercept the chat API. Live gateway checks should send a small prompt once, then repeat it and check that the second response is marked saved.
