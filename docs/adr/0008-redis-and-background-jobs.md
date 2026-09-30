# ADR 0008: Shared state in Upstash Redis and background jobs in QStash

- Status: accepted
- Date: 2026-09-30

## Context

The app runs as Vercel serverless functions. Before this change, each function instance kept
its own rate-limit windows and its own cache of OpenDota responses, so limits multiplied with
the number of instances, OpenDota's shared quota (about 60 calls a minute and a few thousand
a day without a key) could be exceeded without any single instance noticing, and a long match
history only kept importing while the player's browser kept asking for syncs.

We wanted shared rate limits, a shared upstream cache, a global OpenDota call budget, and
durable background work, without running a server of our own.

## Decision

- **Upstash Redis over its REST API** for shared state. It works from serverless functions
  (no persistent connections) and has a free tier.
  - Rate limits: `@upstash/ratelimit` sliding windows shared by every instance. The very
    frequent room poll limit stays per instance to protect the command quota.
  - OpenDota and Valve responses: a second cache layer behind each instance's in-memory cache.
    Keys are a SHA-256 of the URL, so API keys in query strings never reach Redis; responses
    over 512 KB aren't shared.
  - A global OpenDota call budget per minute and per UTC day (plain counters with expiry),
    checked before every upstream call including retries. When it's spent, the gateway
    answers "rate limited" without calling OpenDota and pages take their degraded path.
- **Upstash QStash** for background jobs. A job is published to
  `${APP_URL}/api/jobs/<name>`; QStash delivers it with retries and optional delay. The endpoint
  verifies QStash's signature and answers 500 on failure so QStash retries. Staging's
  deployment protection is passed with Vercel's automation bypass header.
  - `match-backfill`: after a sync that didn't finish a player's history, the next chunk is
    queued after the backfill cooldown, and so on, so a long history finishes without the
    browser open. Capped at 300 chunks.
  - `draft-meta-warm`: the daily cron queues the draft AI's tournament-data refresh instead
    of running it inline, so failures are retried.
- **Idempotency**: every job run is recorded in MongoDB (`job_runs`, kept 14 days). A dedup
  key that already succeeded is skipped. Dedup keys include a time bucket (e.g. a minute or a
  day) so the same logical job can run again later; QStash's own deduplication is a second
  guard.
- **Everything is optional and fails open.** Without the Upstash variables the app behaves as
  before: per-instance limits and caches, the tournament refresh runs inside the cron request,
  and a backfill continues on the player's next sync (a delayed job can't wait in-process, so
  it's skipped). If Redis errors or times out, rate limits fall back to the instance's
  window, and the gateway carries on without the shared cache and budget. Tests and local
  development never use Upstash; the Playwright config blanks the variables.

## Alternatives considered

- **BullMQ or another Redis-backed worker queue**: needs a long-running worker process, which
  Vercel doesn't run. It would mean a second deployment target.
- **Vercel Cron only**: fine for daily work, but can't react per player or retry per job.
- **Redis over TCP (ioredis)**: persistent connections don't suit short-lived functions.

## Consequences

- Two more optional services to configure per environment, and their free-tier limits to keep
  an eye on (Redis commands per day; QStash messages per day). Each OpenDota call costs a few
  Redis commands (budget counters, cache read and write).
- Rate limiting became async; every route awaits it.
- Operators enable it by creating an Upstash Redis database (and QStash), then setting in
  Vercel for each environment: `UPSTASH_REDIS_REST_URL` (`https://<db-host>`),
  `UPSTASH_REDIS_REST_TOKEN` (the REST token; for a database with a Redis password, the
  password works too), and for jobs `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
  `QSTASH_NEXT_SIGNING_KEY`. Optional: `OPENDOTA_BUDGET_PER_MINUTE`, `OPENDOTA_BUDGET_PER_DAY`
  (defaults 60 and 3,000, or 1,200 and 100,000 with `OPENDOTA_API_KEY`).
