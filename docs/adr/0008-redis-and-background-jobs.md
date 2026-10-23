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
    over 512 KB aren't shared. Entries over 16 KB are stored gzipped (base64), so the limit
    applies after compression (OpenDota's 1.3 MB ability constants fit at about 350 KB).
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
  - `meta-warm`: likewise for the Meta page's slow tournament queries. Without QStash both
    run inside the cron request, each capped at the time the run has left.
- **Idempotency**: every job run is recorded in MongoDB (`job_runs`, kept 14 days). A dedup
  key that already succeeded is skipped. Dedup keys include a time bucket (e.g. a minute or a
  day) so the same logical job can run again later; QStash's own deduplication is a second
  guard.
- **Everything is optional and fails open.** Without the Upstash variables the app behaves as
  before: per-instance limits and caches, the tournament refreshes run inside the cron request,
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

## Addendum (2026-10-24): STRATZ position stats for the Meta page

OpenDota's lane roles can't tell a Pos 3 from the Pos 4 beside it, or a Pos 1 from the Pos 5, so
the Meta page split cores from supports by catalog role tags, and misplaced heroes such as
Bounty Hunter (tagged Escape and Nuker, played at Pos 4 in 80% of Ancient–Immortal games).
STRATZ has real per-position public stats.

- **Source.** One GraphQL request (`POST <STRATZ_API_BASE_URL>/graphql`, bearer token, required
  `User-Agent: STRATZ_API`) asks `heroStats.winDay` for each of `POSITION_1`…`POSITION_5`
  (aliased) at Ancient, Divine and Immortal, over the latest 7 days STRATZ has (`take: 7`).
  Daily totals rather than `winWeek` (complete weeks only, so up to a week older) or
  `winGameVersion` (its newest bucket is 7.40, with few games). STRATZ's daily totals lag:
  in October 2026 the newest day was two weeks old, so the page always prints the real dates
  ("Oct 4 – 10"), never "last 7 days". Data more than 28 days old is refused.
- **Gateway.** Its own `ProviderGateway` (`stratz`: separate circuit, 10s timeout, 1 retry),
  its own shared cache (`dd:gw:stratz`, 6h, the cache key is URL plus query body, never the
  token) and its own Redis budget (`dd:budget:stratz`, 20 a minute and 500 a day, far under the
  token's 8/s, 150/min, 1,500/h, 15,000/day). In memory the source keeps the last good answer
  for 48h after failures and waits 5 minutes after a failure before asking again.
- **Source split.** When STRATZ answers, it decides which heroes play a position and their win
  rate there; catalog roles and OpenDota lane data aren't used (and no lane lookups are made).
  OpenDota still supplies the 7-day pick trend, the high-rank record (all positions; kept for
  the draft advisor) and tournament picks and bans, which nudge the order as before. When
  STRATZ is unset, down or refused, everything falls back to the lane-and-role logic, and the
  page says which source placed the heroes. The Meta page and the home preview name STRATZ
  and link to stratz.com wherever its numbers are shown.
- **Thresholds.** A hero counts for a position with at least 15% of its games there (about one
  game in seven: a real, regular role, so flex heroes count for several positions) and at
  least 1,000 games (a win rate's standard error is then about ±1.6 points; the least played
  hero has about 5,000 games a week). Score = 1.75 × (win rate at the position, shrunk toward
  50% with 1,000 virtual games, − 50%) + the tournament and trend nudges; 1.75 replaces the
  high-rank (1) and lane (0.75) terms so the nudges keep their weight.
- **Overview pools.** Each hero goes to the pool (Pos 1, Pos 2–3, Pos 4–5) holding the largest
  combined share of all its games, and is shown at its most-played position in that pool. A
  mid who wins a lot in its few Pos 1 games is still a mid; it's listed only if it ranks there.
- **Warm job.** `meta-warm` fetches the STRATZ stats first (member budget, as background work),
  then ranks every position; with STRATZ answering, that needs no OpenDota lane calls.
