# ADR 0005 — Versioned draft rulesets and the draft reducer

- Status: Accepted
- Date: 2026-09-30

## Context

Spec §2.4 asks for a "current Captain's Mode-style" mode and custom practice
modes, stored as versioned configuration, with the live-game order verified at
implementation time rather than hard-coded as canonical. §4A asks for a
reducer/state machine with optimistic concurrency, an append-only event log and a
factory that picks a ruleset by stored version. ADR 0003 requires the engine to
be pure and serializable so M2 can run it server-side.

## Decision

- **Rulesets are data** (`src/modules/drafts/domain/rulesets.ts`): `{id, version,
sequence, timing, source, verifiedAt}`. A draft stores `rulesetId` and
  `rulesetVersion`; `getRuleset(id, version)` resolves exactly that version. A
  published version is never edited. When Valve changes the order, add a new
  version (or id) and keep the old one so stored drafts still replay.
- **`cm-2026` v1** encodes Captain's Mode as of gameplay patch 7.40 (released
  2025-12-15, unchanged through 7.41f). F is the first-pick team, S the second:

  | Phase       | Order         |
  | ----------- | ------------- |
  | Ban phase 1 | F F S S F S S |
  | Pick 1      | F S           |
  | Ban phase 2 | F F S         |
  | Pick 2      | S F F S S F   |
  | Ban phase 3 | F S F S       |
  | Pick 3      | F S           |

  Each team gets 7 bans (first pick 3-2-2, second pick 4-1-2) and 5 picks
  (1-3-1). Timing: 15s per first-phase ban, 30s per other turn, 130s reserve
  per team. Verified on 2026-09-30 against the official patch notes
  (https://www.dota2.com/patches/7.40, which changed ban phases 1 and 3 from the
  7.34 order `F S S F S S F` / `F S S F`; https://www.dota2.com/patches/7.34) and
  Liquipedia (https://liquipedia.net/dota2/Game_Modes). Some secondary sources
  still show the 7.34 order.

- **`practice-simple` v1** is a custom drill (4 alternating bans each, then 5
  alternating picks each), marked `verifiedAt: null` because it is not a
  live-game mode.
- **Reducer** (`draft-state.ts`): `applyEvent(state, event, ctx)` is pure and
  returns `Result<DraftState, DraftError>`. Every event carries `expectedVersion`
  (stale → `stale_version`) and an authoritative `at` timestamp. `replay` rebuilds
  state from `createDraft` output (or a snapshot) plus the event log. `undo` is
  accepted only when `ctx.mode === "local"`.
- **Timer**: no intervals. State stores `turnStartedAt`, `turnDeadline` and
  reserve per side. `resolveTime(state, now)` spends turn time first, then the
  acting side's reserve; the turn expires when both are used up. A paused draft
  is evaluated at `pausedAt`, and resume shifts the turn timestamps by the paused
  duration.
- **Timeout rule** (same as the live game): an expired ban bans nothing; an
  expired pick takes a "random" hero chosen by a seeded PRNG (the seed is in the
  `timeout` event) from the available pool sorted by id, so replay gives the same
  hero. The side's reserve drops to 0, and the next turn starts at the moment the
  previous turn expired, not when the timeout was observed, so resolving expiry
  lazily (ADR 0003) is deterministic.

## Consequences

- Updating the live CM order means shipping a new ruleset version and re-checking
  `source` and `verifiedAt`.
- Undo doesn't refund reserve time, and it restarts the reverted turn's clock at
  the undo instant.
- Composition feedback (`composition-feedback.ts`) is rule-based on OpenDota role
  tags. It names the heroes behind each finding, caps confidence at `medium`, and
  never outputs a win probability.
