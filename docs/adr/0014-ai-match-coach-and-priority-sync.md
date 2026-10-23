# ADR 0014: AI match coach and Plus priority sync

- Status: Accepted (built; the coach is on wherever a Groq key is set)
- Date: 2026-10-23
- Extends: ADR 0013 (Plus), ADR 0008 (jobs and the OpenDota budget)

## Context

Players asked "what should I do differently?" after a game. The match page already shows the
facts (laning at 10 minutes, item timings, team fight deaths, OpenDota percentiles), but not
what they mean. A language model can turn them into a few coaching points, but models make up
numbers, cost money per call, and can be slow. Separately, Plus supporters with long match
histories wait a long time for their first import, and the coach needs parsed replays.

## Decision

### AI match coach

On the match page, **for the signed-in player's own match only**, a card offers a coach review:
3–5 short points (a strength or something to work on), each citing the facts it uses.

**Grounding.** The model never sees raw match data, only a fact sheet built by a pure, tested
function (`matches/domain/coach-facts.ts`) from data we already have for that match and
player: result, game length, patch (when the patch timeline knows it), party status as
reported upstream (missing `party_size` is **unknown**, never solo), K/D/A, KDA, last hits,
denies, GPM/XPM, net worth, damage, lane role and efficiency, last hits/denies/gold at 10
minutes, each lane opponent's last hits and gold at 10, the lane result (`laneResult`, the
same rule as the hero coaching extras), wards, stacks, stuns, team fight participation, team
fight deaths by game phase, completed-item timings (first purchase, items of 1,400 gold or
more, no consumables or recipes), and OpenDota's percentiles against the same hero. Anything
missing is listed as `missing` and the prompt says so; nothing is estimated.

The prompt asks for JSON (`{points: [{kind, title, detail, facts: [keys]}]}`). Every answer is
checked before anyone sees it:

1. zod shape (`schemas/coach-review.schema.ts`);
2. 3–5 points, each citing at least one fact key, every key present in the sheet;
3. **no invented numbers**: every number in the text must be one of the sheet's values (as
   given, rounded, or in thousands with one decimal like "3.8k"), small counts included:
   "died 4 times" fails when the sheet says 3 deaths. The only numbers exempt are **time
   markers**: "minute N", "min N", "N minutes", "N min", "first N minutes", "N-minute" (and
   Filipino/Cebuano "minuto"), and clock times "N:SS". So a clock time in the text isn't
   checked against the item timings; the cited timing chip next to the point shows ours.

An answer that fails is retried **once**, with the problems listed in the prompt; a second
failure (or the model being down or timing out) shows "the coach couldn't write this review",
and nothing is counted or stored. **The UI renders the cited numbers from our stored fact
sheet, next to each point, never from the model's text.** The card is labelled "AI coach",
says it can be wrong, and lists what data was missing.

**Parsed matches only.** Without the player's laning (an unparsed replay), the card explains
why and shows the existing parse request.

**Quota.** Plus: unlimited. Free: **one new review per rolling 7 days** (`coachQuota`, pure: a
review written at `t` counts while `now − t < 7 days`). Only reviews that were written count;
reopening a stored review never does. With `PLUS_ENABLED` off everyone is free, so the free
quota applies to everyone (accepted). Nothing that was free before becomes paid: the coach is
new, and the draft AI review keeps its old terms.

Two tabs can't both spend the last free slot. Each user's slots live in **one document**, and
`reserve()` is a single atomic pipeline update on it: drop slots that no longer count (reviews
older than the window, expired holds), then add a short-lived **hold** only if fewer than
`limit` remain. The database serialises concurrent updates of one document, so exactly one
request gets the last slot. (A first version inserted one row per hold and ranked them; a
request with an earlier id could still win after another had already won, which the
integration test caught.) A hold becomes a counted use when the review is stored, and is
removed when generation fails; a crashed request's hold stops counting after 3 minutes.

**Storage.** `match_coach_reviews` (`schemaVersion` 1), one document per
`(matchId, accountId32, model, promptVersion, locale)` (`_id` is that tuple), kept permanently: the
fact sheet, the points with their fact keys, the user and when it was written. Changing the
model (`MATCH_COACH_MODEL`) or `COACH_PROMPT_VERSION` gives players a fresh review; old ones
stay. `match_coach_usage` (`schemaVersion` 1): one document per user (`_id` = user id) with the
slots that still count, removed by a TTL index 8 days after its last change. Both are in "Download your data" (`coachReviews`,
`coachReviewUses`; holds aren't exported) and deleted with the account (reviews by user or
Dota account). Indexes are in `scripts/ensure-indexes.ts`.

**Cost controls.**

- Every model call (including the retry) takes one unit of the **existing global daily Groq
  budget** (`DRAFT_AI_BUDGET_PER_DAY`, counter `dd:budget:llm:drafts`, now `sharedAiBudget()`),
  shared with the AI captain and the draft review. When it's spent the card says "the coach is
  resting, try again later" and no quota is consumed. The budget fails open when Redis is down
  (as before).
- A stored review is returned before any quota or budget check, so reopening costs nothing.
- `POST /api/v1/matches/:matchId/coach`: same-origin and session guard, **5 requests per 10
  minutes per user** (shared Redis limiter), `maxDuration` 60 s, each model call capped at
  `MATCH_COACH_TIMEOUT_MS` (25 s) with no transport retry.
- The page only reads (stored review, quota); the model is called when the player presses the
  button, with a loading state.
- Off without a key (`MATCH_COACH_API_KEY`, else `GROQ_API_KEY`) or with
  `MATCH_COACH_ENABLED=false`: the card isn't shown.

**Language.** The review is written in the viewer's interface language (`getLocale()`: en,
fil or ceb), with hero and item names, fact keys and numbers kept as given. The locale is part
of the cache key, so the same match in another language is a **new review**: for a free
player it counts against the weekly quota like any other (accepted), and the earlier one stays
stored and is shown again when they switch back.

### Plus priority sync

`policyFor(isPlus)` (pure, `domain/sync-policy.ts`) returns the account's sync pace:

|                                | Free  | Plus  |
| ------------------------------ | ----- | ----- |
| Wait between history chunks    | 30 s  | 10 s  |
| History pages per sync / chunk | 5     | 8     |
| Wait once history is complete  | 5 min | 5 min |

It's used everywhere the pace matters: the sync lock (`acquire()` cooldowns), the page budget
of an on-visit sync and of each QStash backfill chunk (the daily cron keeps its own explicit
budget), `isStale`, the jobs scheduler's delay between chunks, and the `SyncControl` client,
which now gets the cooldown from the page instead of a constant, so a Plus player's browser
doesn't wait 30 s. Plus is looked up by Dota account (`plusService.supporters`), which is one
indexed query when Plus is on, nothing when it's off, and fails closed to the free pace.

The backfill job's dedup bucket is now the account's cooldown instead of a fixed minute: a
chained chunk is always at least one cooldown after its parent, so it can't collide with the
parent's bucket and silently end the chain (a 10 s chain would have, with 60 s buckets).

**Auto parse requests.** After a Plus player's on-visit sync imports new games, after the
response (`afterResponse`), we ask OpenDota to parse their newest unparsed games from the last
7 days: at most **3 per sync**, each match at most once per 3 days (`match_parse_requests`,
`_id` = match id, TTL; no user data), within the parse button's allowance (6 per 10 minutes)
counted per player, and through the shared OpenDota gateway, so the **member budget** applies
(the sync request carries the session). A refused or failed request gives its claim back and
stops the run.

**Free players aren't starved.** Nothing here adds budget: every call still goes through the
one global OpenDota budget (per minute and per day) and its guest/member split (ADR 0008).
Plus only changes how often one supporter's own import asks for its next chunk and how many
pages a chunk may read; when the budget is short, Plus calls get "rate limited" like everyone
else's and the import waits.

## Consequences

- One more paid-model feature on the same daily budget: a busy day of coach reviews can make
  the AI captain fall back to its data pick sooner. `llm_budget_usage` logs show the split
  only in total; raise `DRAFT_AI_BUDGET_PER_DAY` if that happens.
- The grounding check rejects some good answers (a number phrased differently), costing a
  retry; the price of never showing an invented statistic.
- Two new collections with personal data (reviews and quota rows) and one without
  (`match_parse_requests`).
- Plus players' imports draw on the shared OpenDota budget faster while they're importing
  (up to 8 pages every 10 s instead of 5 every 30 s, per importing supporter), plus up to 3
  parse requests per sync. Watch `opendota_budget_usage` as Plus grows.
