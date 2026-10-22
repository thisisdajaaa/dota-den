# Configuration

All configuration is environment variables, parsed and validated once at startup by `src/common/config/env.ts` (Zod). An invalid
value stops the app with a message that names the variable (never its value). Empty strings count as unset.

Only containers and infrastructure read the env; services and domain code receive values through their
constructors. `.env.example` lists every variable with its default.

## Core

| Variable                | Type                                    | Default        | Required            | Used for                                                                                                                         |
| ----------------------- | --------------------------------------- | -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`               | URL                                     | none           | yes                 | Canonical origin: OpenID return URL and same-origin checks                                                                       |
| `MONGODB_URI`           | string                                  | none           | yes                 | MongoDB connection string (least-privilege user)                                                                                 |
| `MONGODB_DB_NAME`       | string                                  | `dota_den_dev` | no                  | Database name (`dota_den` in staging and production)                                                                             |
| `MONGODB_MAX_POOL_SIZE` | int 1-100                               | `10`           | no                  | Driver pool size per server instance                                                                                             |
| `MONGODB_TIMEOUT_MS`    | int 0-600000                            | `10000`        | no                  | Time limit per database operation (driver `timeoutMS`); `0` turns it off. `npm run db:indexes` sets 0 (index builds can be slow) |
| `LOG_LEVEL`             | `debug` \| `info` \| `warn` \| `error`  | `info`         | no                  | Structured JSON logs                                                                                                             |
| `NODE_ENV`              | `development` \| `test` \| `production` | `development`  | set by the platform |                                                                                                                                  |

## Upstreams and auth

| Variable                             | Type                    | Default          | Used for                                                                                     |
| ------------------------------------ | ----------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `OPENDOTA_API_KEY`                   | secret                  | unset            | Higher OpenDota limits; sent as the `api_key` query parameter (logs record paths only)       |
| `OPENDOTA_BASE_URL`                  | URL                     | public API       | Tests point this at the fixture server                                                       |
| `VALVE_DATAFEED_BASE_URL`            | URL                     | Valve's datafeed | Tests point this at the fixture server                                                       |
| `STEAM_WEB_API_KEY`                  | secret                  | unset            | "Friends playing now" on the overview (Steam presence). Unset: the strip is hidden           |
| `STEAM_API_BASE_URL`                 | URL                     | Steam Web API    | Tests point this at the fixture server                                                       |
| `TWITCH_CLIENT_ID`                   | string                  | unset            | Twitch app: find and embed streams of live games (with the secret)                           |
| `TWITCH_CLIENT_SECRET`               | secret                  | unset            | Twitch app secret. Unset: live games show Twitch and YouTube search links only               |
| `KICK_CLIENT_ID`                     | string                  | unset            | Kick app: Kick's live Dota 2 streams on `/live`, next to Twitch's (with the secret)          |
| `KICK_CLIENT_SECRET`                 | secret                  | unset            | Kick app secret. Unset: `/live` lists Twitch only                                            |
| `KICK_API_BASE_URL`, `KICK_AUTH_URL` | URL                     | Kick's API       | Tests point these at the fixture server                                                      |
| `VAPID_PUBLIC_KEY`                   | string                  | unset            | Web Push public key (`npx web-push generate-vapid-keys`). Set both VAPID keys, or neither    |
| `VAPID_PRIVATE_KEY`                  | secret                  | unset            | Web Push private key. Unset: notifications are off and the Account page says so (ADR 0010)   |
| `VAPID_SUBJECT`                      | `mailto:` or `https:`   | `APP_URL`        | Contact for push services                                                                    |
| `GROQ_API_KEY`                       | secret                  | unset            | Language model for the AI captain and AI review. Without it: data-only captain, no AI review |
| `ADMIN_STEAM_IDS`                    | comma list of SteamID64 | empty            | Users granted the admin role (manual patch import)                                           |
| `CRON_SECRET`                        | secret, 16+ chars       | unset            | Bearer secret Vercel Cron sends to `/api/cron/*`. Unset disables cron routes (503)           |
| `ADMIN_ALERT_WEBHOOK_URL`            | Discord webhook URL     | unset            | Owner alerts also go to this Discord channel. Only `https://discord.com/api/webhooks/…` URLs |
| `AUTH_TEST_MODE`                     | `true`/`false`          | `false`          | Fake identity provider for E2E and local dev. Refused when `NODE_ENV=production`             |
| `FEATURE_DRAFT_ROOMS`                | `true`/`false`          | `true`           | Multiplayer draft rooms on or off                                                            |

## AI

| Variable                     | Type           | Default               | Used for                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAFT_AI_MODEL`             | string         | `openai/gpt-oss-120b` | Groq model for the AI captain and review                                                                                                                                                                                                                             |
| `MMR_VISION_MODEL`           | string         | `qwen/qwen3.8-27b`    | Groq vision model that reads an MMR from a screenshot (MMR dialog); needs `GROQ_API_KEY`                                                                                                                                                                             |
| `DRAFT_AI_MOVE_TIMEOUT_MS`   | int            | `15000`               | Timeout for one AI captain move (falls back to the top-ranked hero)                                                                                                                                                                                                  |
| `DRAFT_AI_REVIEW_TIMEOUT_MS` | int            | `30000`               | Timeout for one AI review                                                                                                                                                                                                                                            |
| `DRAFT_AI_REVIEW_ENABLED`    | `true`/`false` | `true`                | Turn the AI review off without removing the key                                                                                                                                                                                                                      |
| `DRAFT_AI_BUDGET_PER_DAY`    | int            | `2000`                | Groq calls the AI captain and review may make per UTC day, across instances (Redis; per instance without it). Past it, the captain plays its data-driven pick and the review says it's unavailable. Logs `llm_budget_usage` at 50/80/100% and `llm_budget_exhausted` |

## Operator tuning

All optional; each default is the value the app used before it became configurable.

**Rate limits** (per client IP; per minute unless noted). Read by `src/common/http/api-limits.ts` and passed to `rateLimit()`.

| Variable                               | Default | Routes                                            |
| -------------------------------------- | ------- | ------------------------------------------------- |
| `RATE_LIMIT_DRAFT_AI_MOVE_PER_MIN`     | `40`    | `POST /api/v1/drafts/ai-move`                     |
| `RATE_LIMIT_DRAFT_SUGGESTIONS_PER_MIN` | `60`    | `POST /api/v1/drafts/suggestions`                 |
| `RATE_LIMIT_DRAFT_OUTLOOK_PER_MIN`     | `60`    | `POST /api/v1/drafts/outlook`                     |
| `RATE_LIMIT_DRAFT_REVIEW_PER_MIN`      | `6`     | `POST /api/v1/drafts/review`                      |
| `RATE_LIMIT_DRAFT_CHALLENGE_PER_MIN`   | `30`    | `POST /api/v1/drafts/challenges/grade`            |
| `RATE_LIMIT_ROOM_CREATE_PER_HOUR`      | `10`    | `POST /api/v1/drafts/rooms`                       |
| `RATE_LIMIT_ROOM_POLL_PER_MIN`         | `240`   | `GET /api/v1/drafts/rooms/{id}`, `GET …/result`   |
| `RATE_LIMIT_ROOM_ACTION_PER_MIN`       | `120`   | room join, leave, start, actions, rematch, result |

Per-user throttles on settings (follows, notes, session gap, visibility, draft results) are fixed in code.

**Draft rooms** ([ADR 0003](adr/0003-multiplayer-draft-transport.md) abuse caps)

| Variable                            | Default | Meaning                                                                   |
| ----------------------------------- | ------- | ------------------------------------------------------------------------- |
| `DRAFT_ROOMS_MAX_ACTIVE`            | `50`    | Rooms that may be active at once                                          |
| `DRAFT_ROOMS_ACTIVE_WINDOW_MINUTES` | `120`   | "Active" means touched within this window                                 |
| `DRAFT_ROOM_TTL_HOURS`              | `24`    | Rooms expire this long after their last move (history is kept separately) |

**Tournament data for the draft AI** (OpenDota explorer)

| Variable                    | Default | Meaning                                                                    |
| --------------------------- | ------- | -------------------------------------------------------------------------- |
| `DRAFT_PRO_WINDOW_DAYS`     | `21`    | Window for tournament picks, bans and pro win rates                        |
| `DRAFT_SYNERGY_WINDOW_DAYS` | `60`    | Window for pro pairings, positions and lane results                        |
| `DRAFT_META_FRESH_HOURS`    | `12`    | Cached explorer results are refreshed after this (served stale meanwhile)  |
| `DRAFT_EXPLORER_BUDGET_MS`  | `4000`  | How long a request waits for a cold explorer query before going without it |

**OpenDota requests**

| Variable                        | Default | Meaning                                                |
| ------------------------------- | ------- | ------------------------------------------------------ |
| `OPENDOTA_TIMEOUT_MS`           | `8000`  | Per-request timeout for the OpenDota API               |
| `OPENDOTA_MAX_RETRIES`          | `2`     | Retries with jitter (honours `Retry-After`)            |
| `OPENDOTA_EXPLORER_TIMEOUT_MS`  | `30000` | Timeout for SQL explorer queries (own circuit breaker) |
| `OPENDOTA_EXPLORER_MAX_RETRIES` | `1`     | Retries for explorer queries                           |

**Leaderboards and sessions**

| Variable                           | Default | Meaning                                                                         |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `LEADERBOARD_ROW_LIMIT`            | `50`    | Rows shown per board (your row is always shown)                                 |
| `LEADERBOARD_EVERYONE_MAX_PLAYERS` | `5000`  | Cap on opted-in players considered for the Everyone boards                      |
| `SESSION_DEFAULT_GAP_MINUTES`      | `60`    | Break that splits sessions for users who haven't chosen one (30, 60, 90 or 120) |

## Redis and background jobs (optional)

With these unset, the app behaves exactly as without them: in-memory rate limits and caches per server instance, and
slow work done inline. The design is in [ADR 0008](adr/0008-redis-and-background-jobs.md).

| Variable                                                                              | Meaning                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                  | Upstash Redis over REST: shared rate limits, a shared OpenDota response cache and a global OpenDota request budget. The REST URL is `https://<your-db-host>`; for a database created with a Redis password, that password works as the REST token. Set both or neither. |
| `QSTASH_TOKEN`, `QSTASH_URL`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Upstash QStash for durable background jobs (chunked match backfills, draft data refresh). Without them, jobs run in-process after the response.                                                                                                                         |
| `OPENDOTA_BUDGET_PER_MINUTE`, `OPENDOTA_BUDGET_PER_DAY`                               | Global OpenDota call budget when Redis is configured                                                                                                                                                                                                                    |

## Weekly email (optional)

Unset, email is off: the Account page says it isn't available yet and nothing is sent. The design is in
[ADR 0011](adr/0011-weekly-email-digest.md).

| Variable                | Default                  | Meaning                                                                                                                                                                                                                            |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`        | unset                    | Resend API key. Set both this and `EMAIL_FROM`, or neither                                                                                                                                                                         |
| `EMAIL_FROM`            | unset                    | Sender, e.g. `Dota Den <digest@yourdomain.com>`; the domain must be verified in Resend                                                                                                                                             |
| `RESEND_API_BASE_URL`   | `https://api.resend.com` | Tests point this at the fixture server's fake Resend API                                                                                                                                                                           |
| `EMAIL_TOKEN_SECRET`    | derived from the API key | Signs confirmation and unsubscribe links (32+ chars). Set it so rotating the Resend key keeps old unsubscribe links working                                                                                                        |
| `RESEND_WEBHOOK_SECRET` | unset                    | Resend webhook signing secret (`whsec_…`). With it, `POST /api/v1/email/webhook` accepts Resend's signed `email.bounced` and `email.complained` events and stops the weekly email to that address. Unset, the endpoint answers 404 |

To turn on bounce and complaint handling, add a webhook in Resend (Webhooks → Add endpoint) for
`https://<your-site>/api/v1/email/webhook` with the events `email.bounced` and `email.complained`,
then copy its signing secret into `RESEND_WEBHOOK_SECRET`.

## Dota Den Plus (optional)

Unset, Plus doesn't exist: `/plus` says "coming soon", it isn't in the navigation, no checkout
button renders, `POST /api/v1/plus/webhook` answers 404 and everyone is free. The design is in
[ADR 0013](adr/0013-plus-subscriptions.md).

| Variable                                                                | Default | Meaning                                                                                                                                        |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLING_PROVIDER`                                                      | unset   | `lemonsqueezy`. Needs `LEMONSQUEEZY_WEBHOOK_SECRET`                                                                                            |
| `PLUS_ENABLED`                                                          | unset   | Kill switch: only `true` grants Plus and offers checkout. Anything else treats everyone as free; stored subscriptions and webhooks are kept    |
| `LEMONSQUEEZY_WEBHOOK_SECRET`                                           | unset   | The webhook's signing secret (Lemon Squeezy → Settings → Webhooks). Webhooks are verified with it (HMAC-SHA256 of the raw body, `X-Signature`) |
| `LEMONSQUEEZY_CHECKOUT_URL_MONTHLY`, `LEMONSQUEEZY_CHECKOUT_URL_YEARLY` | unset   | Each variant's checkout (share) link, `https://<store>.lemonsqueezy.com/buy/<id>`. A plan without one isn't offered                            |
| `LEMONSQUEEZY_STORE_URL`                                                | unset   | The store, for the generic billing portal (`<store>/billing`); defaults to the checkout links' origin                                          |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY`, `LEMONSQUEEZY_VARIANT_ID_YEARLY`     | unset   | Numeric variant ids, so the account page can say "Monthly" or "Yearly"                                                                         |
| `LEMONSQUEEZY_TEST_MODE`                                                | `false` | `true` on a deployment that takes test-mode purchases; it then ignores live ones (and the other way round)                                     |

Go-live alerts (a Plus feature) also need Web Push (`VAPID_*`), Twitch or Kick keys, and a schedule:
run `npm run jobs:schedules` once per environment (needs `QSTASH_TOKEN` and `APP_URL`) to create the
QStash schedule that calls `/api/jobs/streamer-alerts` every 5 minutes. Without QStash, any scheduler
can call `GET /api/cron/streamer-alerts` with `Authorization: Bearer $CRON_SECRET`.

## Test-only

| Variable                                  | Default                     | Used by                             |
| ----------------------------------------- | --------------------------- | ----------------------------------- |
| `MONGODB_TEST_URI`                        | `mongodb://127.0.0.1:27017` | Integration and E2E tests           |
| `E2E_PORT`, `FIXTURE_PORT`, `E2E_DB_NAME` | see `playwright.config.ts`  | Run several E2E setups side by side |
| `E2E_PLAIN_PORT`                          | `E2E_PORT + 2`              | The second E2E app server (no Plus) |
| `CALIBRATE_DAYS`, `CALIBRATE_GAMES`       | `14`, `15000`               | `npm run draft:calibrate`           |
