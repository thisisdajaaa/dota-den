# Roadmap

What we could build next, with the reasons. Each item has a GitHub issue with the details
and what "done" means; this page is the overview. Shipped work is in
[CHANGELOG.md](../CHANGELOG.md).

**Priorities:** P1 do next · P2 soon · P3 later. Items marked _needs key_ are blocked on an API
key or account setup, not on code.

## Turn on (code done, needs a key)

These are built and tested; each starts working when its keys are set in Vercel (see
[configuration](configuration.md)). Push notifications, Twitch, Kick, Steam, QStash and STRATZ
keys are set.

| Feature                                 | Still needed                                                                                                                        | Issue                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Weekly email digest and bounce handling | A Resend account and verified sending domain: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` (`EMAIL_TOKEN_SECRET` is set) | [#10](https://github.com/thisisdajaaa/dota-den/issues/10), [#24](https://github.com/thisisdajaaa/dota-den/issues/24) |
| Higher OpenDota limits                  | `OPENDOTA_API_KEY`                                                                                                                  | [#14](https://github.com/thisisdajaaa/dota-den/issues/14)                                                            |

## Plus: what's next (plan of 2026-10-25)

Plus adds depth, convenience and the features that cost money to run (AI calls, extra API
usage); nothing free becomes paid. AI features follow the coach's rule: the model writes the
words, our data supplies every number, and a checker rejects anything it can't back.

| Priority | Feature                                   | What the player gets                                                                                                                                                                 | Builds on                                  | Status                                     |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| P1       | Auto post-game review                     | A few minutes after a ranked game is parsed: a push ("Your Invoker game is reviewed") opening a ready coach review                                                                   | Priority sync, auto-parse, coach, push     | Shipped (2026-10-25)                       |
| P1       | Pick for me (real ranked drafts)          | Enter the enemy picks during hero selection; get picks from **your own pool**, ranked by your win rates against them and high-rank counters, each with a reason                      | AI captain, your matchups, STRATZ matchups | Next                                       |
| P1       | Screenshot pick reader                    | Upload a screenshot (or phone photo) of the pick screen; the heroes are read, you confirm, then "Pick for me" answers                                                                | MMR screenshot reader (vision model)       | After an accuracy test on real screenshots |
| P2       | AI weekly report                          | Every Monday: patterns across your week (tilt after losses, deaths before 10 min, best hero this patch), in the app; by email once Resend is set                                     | Sessions/tilt, hero stats, coach checker   | Planned                                    |
| P2       | Discord: link your account + Dota Den bot | Connect Discord on the account page; a bot for friend servers: `/den me`, `/den stack`, `/den leaderboard` (free), `/den coach`, `/den pick` and weekly reports to the server (Plus) | Discord feed, groups, coach                | Planned                                    |
| P3       | Build check vs high-rank                  | "Your Battle Fury at 17:40; Legend–Immortal at 14 min", with one AI suggestion                                                                                                       | STRATZ item timings, your parsed games     | Planned                                    |
| P3       | Draft post-mortem for real games          | Why a ranked draft won or lost (lanes, counters, timing)                                                                                                                             | Draft record, outlook, AI review           | Planned                                    |
| P3       | Deeper stats                              | Per-patch and per-position splits, time of day, lane partners, game length                                                                                                           | Your imported games                        | Planned                                    |
| P3       | Ask your stats                            | A chat that answers only through queries over your data                                                                                                                              | Everything above                           | Last                                       |

## Principles for new features

- **Honest numbers.** Never invent MMR, party membership or win chances. Estimates are labelled;
  small samples are shown with their size or hidden.
- **The player's data stays theirs.** Logged MMR, notes and goals are private unless a player opts in.
- **Gentle with OpenDota.** Cache, share caches across servers, and keep calls per page small.
- **Every feature ships with tests** (unit for the logic, E2E for the page) and goes through staging
  before production.
