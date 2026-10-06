# Draft engine

Everything in `src/modules/drafts`. The domain code is pure and fully unit-tested; data arrives through the
`DraftInsights` port.

## Rules engine

- `domain/draft-state.ts` is a pure reducer: start, pick, ban, pause, resume, timeout, undo. Every event carries the
  version it expects, so stale or duplicate events are rejected.
- `domain/rulesets.ts` holds versioned rulesets ([ADR 0005](adr/0005-draft-rulesets.md)):
  - **Captain's Mode (current-style)**: the 7.40 order (first-pick team bans 3-2-2, second-pick team bans 4-1-2,
    picks 1-3-1), 15 s first-phase bans, 30 s other turns, 130 s reserve per team. A ban that times out bans nothing;
    a pick that times out picks a random hero.
  - **Simple practice**: 4 alternating bans per team, then 5 alternating picks per team.
- Timeouts are seeded so a replayed draft resolves the same way. Snapshots (share links, API calls) are replayed
  through the engine on the server.

## Positions

`domain/draft-positions.ts`. Five positions: 1 Carry, 2 Mid, 3 Offlane, 4 Soft support, 5 Hard support.

- **Where heroes are played** comes from pro matches in the last 60 days: within each team and lane, the hero with
  the most gold per minute is the core (safe lane → pos 1, mid → pos 2, off lane → pos 3) and the others are its
  supports (off lane → pos 4, safe lane → pos 5).
- Each hero's odds are blended with a prior from its role tags (8 pseudo-games), so a few games can't pin a hero
  down. Heroes with under 20 pro games are described as "from role tags".
- A lineup's positions are the most likely split: every hero a different position, maximising the product of their
  odds (exhaustive search; at most 120 orderings). You can pin positions by hand ("Change who plays where"), and the
  rest are fitted around them.

## Lanes

`domain/draft-lanes.ts`. Two heroes "met in lane" when they were on opposite teams in opposing lanes (safe vs off,
mid vs mid) in a pro game. The lane is won by the side whose heroes in that lane had more gold at 10 minutes. Records
need 4+ games and are damped toward even (10 pseudo-games). In the outlook, a lane with 6+ pooled pro games uses pro
lane results; otherwise it falls back to whole-game head-to-heads and says so.

## Scoring candidates

`domain/draft-scoring.ts` → `rankCandidates`. For every legal hero:

| Signal        | How                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero strength | Public win rate at Ancient+ this patch, as points above 50%, shrunk on small samples (500 pseudo-games)                                                                     |
| Matchups      | Head-to-head vs the heroes that matter, measured against what the two win rates predict (so a strong hero isn't counted twice); 40+ games needed; damped (130 pseudo-games) |
| Tournaments   | Share of recent pro drafts (21 days) that picked or banned the hero, and its pro win rate; weighs more for bans                                                             |
| Pairings      | Pro results together with heroes on the same side, measured against each hero's own pro win rate; 6+ games; heavily damped                                                  |
| Position fit  | Picks must fill an open position naturally (with pro data); bans prefer heroes that fill the opponent's open positions                                                      |
| Lane          | Pro lane results against the heroes it would actually lane against                                                                                                          |

Picks score against the enemy and for our lineup; bans score against our heroes and for the enemy's lineup. Every
candidate carries plain-language facts (the evidence the AI cites).

## Draft outlook

`domain/draft-outlook.ts`. For both lineups: hero strength, matchups, lanes and pairings per side (in points), lineups
by position, lane-by-lane matchups, per-hero stats (win rate, tournament presence, best and worst matchup), warnings
(e.g. a hero forced off its usual position) and takeaways.

**Estimated win chance.** `P(Radiant) = sigmoid(Σ wᵢ · (Radiantᵢ − Direᵢ))` over hero strength, matchups, lanes and
pairings, with weights fitted to real games (below). The fitted intercept (Radiant's general side advantage) is left
out: the number describes the draft. It is clamped to 30-70% and always labelled an estimate, with the held-out
accuracy shown.

## Report card

`domain/draft-report.ts`. Six criteria per side, each 0-100 where 50 is an average draft:

| Criterion     | Scored from                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Lanes         | Average lane edge (pro lane results, else head-to-heads)                                                                        |
| Counters      | Average head-to-head advantage per hero vs the enemy lineup                                                                     |
| Composition   | Role-tag checks: initiation, control (2+ disablers), frontline, late game (a Carry at pos 1), burst (2+ nukers), tower pressure |
| Hero strength | Average win rate edge this patch, with pro results folded in                                                                    |
| Positions     | How often pros play each hero at its position (geometric mean), minus penalties for off-role heroes                             |
| Combos        | Average pro pairing edge                                                                                                        |

Grades: A 75+, B 62+, C 50+, D 38+, F below. Criteria without data are left out of the overall grade. The report is
provisional until both lineups are complete, and names the criteria that decide the draft.

**Weights** are half the prior (20/20/20/15/15/10%) and half the weights fitted to real games; `CRITERIA` in
`draft-report.ts` holds the exact values in use.

## Calibration

`npm run draft:calibrate` (`scripts/calibrate-draft.ts`, pure fitting code in `domain/draft-calibration.ts`):

1. Fetch recent ranked Divine+ All Pick games from OpenDota's explorer (`public_matches`: heroes and winner).
2. Score every draft with the app's own outlook code on today's data.
3. Fit a logistic regression on the older 80% and evaluate on the newest 20%.
4. Write `src/modules/drafts/domain/draft-calibration.json` (commit it).

Current fit (15,000 games from 14 days, 3,000 held out):

| Model                       | Held-out accuracy | Log loss |
| --------------------------- | ----------------- | -------- |
| Fitted estimate             | 57.0%             | 0.678    |
| Previous hand-tuned formula | 54.8%             | 0.691    |
| Always picking Radiant      | 54.6%             | 0.690    |

In public games, current hero strength is by far the strongest signal; lanes, counters and pairings (whose data comes
from pro games) add little. Hero stats and matchups come from recent public games that overlap the test games, so the
accuracy is somewhat optimistic. Options: `CALIBRATE_DAYS` (default 14), `CALIBRATE_GAMES` (default 15000). Without an
OpenDota key the script throttles itself to the free rate limit (a few minutes).

## AI captain

`services/ai-opponent.service.ts` → `move()`. The server ranks candidates and sends a shortlist of 12 with their
facts, the lineup situation by position, and the tournament picture to the language model
(`infrastructure/groq-draft-advisor.ts`). The model must pick from the shortlist and give a short reason citing the
data; anything else (or a timeout) falls back to the top-ranked candidate, marked "rule-based" in the draft log.

## AI review

`review()` on a finished draft. The model gets both lineups with positions and each hero's **current** abilities (from
OpenDota's game-file constants: description, damage type, whether it pierces spell immunity), plus the evidence lines
behind the report card. It returns a summary, each side's win condition, timing, strengths and risks, combos and key
matchups, and optional grade nudges.

Guardrails (`domain/draft-review.ts`):

- Anything naming a hero outside the draft is dropped.
- Only **Combos** and **Composition** may be nudged, by at most **8 points** per side, once each, with a reason.
- The data report card stays the source of truth (leaderboards use it); nudged grades are shown alongside, labelled.
- The prompt forbids inventing statistics and claiming interactions the ability text doesn't support.
- Reviews are cached per draft, positions and model; the route is rate limited.
