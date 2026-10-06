# Configuration

All configuration is environment variables, parsed and validated once at startup by `src/common/config/env.ts` (Zod). An invalid
value stops the app with a message that names the variable (never its value). Empty strings count as unset.

Only composition roots and infrastructure read the env; services and domain code receive values through their
constructors. `.env.example` lists every variable with its default.

## Core

| Variable                | Type                                    | Default        | Required            | Used for                                                   |
| ----------------------- | --------------------------------------- | -------------- | ------------------- | ---------------------------------------------------------- |
| `APP_URL`               | URL                                     | none           | yes                 | Canonical origin: OpenID return URL and same-origin checks |
| `MONGODB_URI`           | string                                  | none           | yes                 | MongoDB connection string (least-privilege user)           |
| `MONGODB_DB_NAME`       | string                                  | `dota_den_dev` | no                  | Database name (`dota_den` in staging and production)       |
| `MONGODB_MAX_POOL_SIZE` | int 1-100                               | `10`           | no                  | Driver pool size per server instance                       |
| `LOG_LEVEL`             | `debug` \| `info` \| `warn` \| `error`  | `info`         | no                  | Structured JSON logs                                       |
| `NODE_ENV`              | `development` \| `test` \| `production` | `development`  | set by the platform |                                                            |

## Upstreams and auth

| Variable                  | Type                    | Default          | Used for                                                                                     |
| ------------------------- | ----------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `OPENDOTA_API_KEY`        | secret                  | unset            | Higher OpenDota limits; sent as the `api_key` query parameter (logs record paths only)       |
| `OPENDOTA_BASE_URL`       | URL                     | public API       | Tests point this at the fixture server                                                       |
| `VALVE_DATAFEED_BASE_URL` | URL                     | Valve's datafeed | Tests point this at the fixture server                                                       |
| `STEAM_WEB_API_KEY`       | secret                  | unset            | Custom Steam URL (`steamcommunity.com/id/…`) lookups in player search                        |
| `TWITCH_CLIENT_ID`        | string                  | unset            | Twitch app: find and embed streams of live games (with the secret)                           |
| `TWITCH_CLIENT_SECRET`    | secret                  | unset            | Twitch app secret. Unset: live games show Twitch and YouTube search links only               |
| `GROQ_API_KEY`            | secret                  | unset            | Language model for the AI captain and AI review. Without it: data-only captain, no AI review |
| `ADMIN_STEAM_IDS`         | comma list of SteamID64 | empty            | Users granted the admin role (manual patch import)                                           |
| `CRON_SECRET`             | secret, 16+ chars       | unset            | Bearer secret Vercel Cron sends to `/api/cron/*`. Unset disables cron routes (503)           |
| `AUTH_TEST_MODE`          | `true`/`false`          | `false`          | Fake identity provider for E2E and local dev. Refused when `NODE_ENV=production`             |
| `FEATURE_DRAFT_ROOMS`     | `true`/`false`          | `true`           | Multiplayer draft rooms on or off                                                            |

## AI

| Variable                     | Type           | Default               | Used for                                                                                 |
| ---------------------------- | -------------- | --------------------- | ---------------------------------------------------------------------------------------- |
| `DRAFT_AI_MODEL`             | string         | `openai/gpt-oss-120b` | Groq model for the AI captain and review                                                 |
| `MMR_VISION_MODEL`           | string         | `qwen/qwen3.8-27b`    | Groq vision model that reads an MMR from a screenshot (MMR dialog); needs `GROQ_API_KEY` |
| `DRAFT_AI_MOVE_TIMEOUT_MS`   | int            | `15000`               | Timeout for one AI captain move (falls back to the top-ranked hero)                      |
| `DRAFT_AI_REVIEW_TIMEOUT_MS` | int            | `30000`               | Timeout for one AI review                                                                |
| `DRAFT_AI_REVIEW_ENABLED`    | `true`/`false` | `true`                | Turn the AI review off without removing the key                                          |

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

## Test-only

| Variable                                  | Default                     | Used by                             |
| ----------------------------------------- | --------------------------- | ----------------------------------- |
| `MONGODB_TEST_URI`                        | `mongodb://127.0.0.1:27017` | Integration and E2E tests           |
| `E2E_PORT`, `FIXTURE_PORT`, `E2E_DB_NAME` | see `playwright.config.ts`  | Run several E2E setups side by side |
| `CALIBRATE_DAYS`, `CALIBRATE_GAMES`       | `14`, `15000`               | `npm run draft:calibrate`           |
