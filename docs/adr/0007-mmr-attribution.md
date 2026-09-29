# ADR 0007 — MMR journal and calendar attribution

- Status: Accepted
- Date: 2026-09-30

## Context

Public APIs don't expose MMR per match (spec §2.1). Users type in the MMR their
client shows. The calendar has to show daily gains and losses without ever
implying that a daily figure came from the match API, and without presenting
estimates as actual values.

## Decision

- `mmr_entries` holds user observations: `{userId, accountId32, observedAt, mmr,
note, source: "user"}`, indexed on `{userId, accountId32, observedAt}`.
  Every query is scoped by user and account, so accounts never mix, and edits
  and deletes filter by owner.
- The calendar is computed on request from entries and ranked match facts by
  the pure `buildCalendar`:
  1. **Actual:** when every ranked game between two consecutive entries was
     played on one local day, that day gets the exact delta, even if the entries
     were logged on other days.
  2. **Interval:** otherwise the delta is only known for the whole span, and no
     single day gets an actual value. An interval with no games attributes
     nothing.
  3. **Estimate:** each day also carries a labelled estimate of ±25 per ranked
     win or loss. The UI marks estimates with "≈" and a dashed border.
- A queue scope (solo or party) only shows an actual delta when every game in
  the interval matches that scope, because MMR isn't tracked per queue.
- Days are the viewer's local days. The browser sets a `dd_tz` cookie, the
  server validates it as an IANA zone, and falls back to UTC.
- There is no `mmr_calendar_daily` collection yet. At prototype scale (a few
  thousand games per account) computing on request is cheap and never stale.
  Add a derived collection keyed by `{accountId32, localDate, timeZone}`,
  rebuilt on entry edits, if profiling shows a need.
