/**
 * Versioned draft rulesets (spec §2.4, §4A; ADR 0005).
 *
 * A ruleset is plain configuration: the reducer in `draft-state.ts` is the single
 * strategy that interprets it. A stored draft keeps `{rulesetId, rulesetVersion}` and
 * `getRuleset` (the factory) resolves exactly that version, so changing the live
 * game's order means adding a new version, never editing an old one in place.
 */
import { err, ok, type Result } from "@/common/result";

/** Draft-relative team: "first" is whichever side has first pick. */
export type DraftTeam = "first" | "second";
export type DraftAction = "pick" | "ban";

export interface DraftStep {
  team: DraftTeam;
  action: DraftAction;
  /** Overrides `timing.perTurnSec` for this step (e.g. CM first-phase bans are 15s). */
  turnSec?: number;
}

export interface DraftRuleset {
  id: string;
  version: number;
  name: string;
  description: string;
  sequence: readonly DraftStep[];
  timing: { perTurnSec: number; reservePerTeamSec: number };
  /** Where the sequence and timing come from. */
  source: string;
  /** ISO date the sequence was checked against `source`; null means unverified. */
  verifiedAt: string | null;
}

export type RulesetError = { type: "unknown_ruleset"; id: string; version: number };

const F = "first" as const;
const S = "second" as const;
const ban = (team: DraftTeam, turnSec?: number): DraftStep =>
  turnSec === undefined ? { team, action: "ban" } : { team, action: "ban", turnSec };
const pick = (team: DraftTeam): DraftStep => ({ team, action: "pick" });

/** First ban phase turns are 15s since 7.34; everything else uses the 30s default. */
const FIRST_PHASE_BAN_SEC = 15;
const fb = (team: DraftTeam): DraftStep => ban(team, FIRST_PHASE_BAN_SEC);

/**
 * Captain's Mode as of gameplay patch 7.40 (unchanged through 7.41f).
 * 7.34 introduced 3-2-2 / 4-1-2 bans with 1-3-1 picks; 7.40 reordered ban phases 1 and 3.
 */
const CM_2026_V1: DraftRuleset = {
  id: "cm-2026",
  version: 1,
  name: "Captain's Mode (current-style)",
  description:
    "Captain's Mode order from gameplay patch 7.40: 7 bans and 5 picks per team " +
    "(first-pick team bans 3-2-2, second-pick team bans 4-1-2, picks 1-3-1). " +
    "15s per first-phase ban, 30s per other turn, 130s reserve per team. " +
    "A ban that times out bans nothing; a pick that times out picks a random hero.",
  sequence: [
    // Ban phase 1 (7.40): F F S S F S S
    fb(F),
    fb(F),
    fb(S),
    fb(S),
    fb(F),
    fb(S),
    fb(S),
    // Pick phase 1: F S
    pick(F),
    pick(S),
    // Ban phase 2: F F S
    ban(F),
    ban(F),
    ban(S),
    // Pick phase 2: S F F S S F
    pick(S),
    pick(F),
    pick(F),
    pick(S),
    pick(S),
    pick(F),
    // Ban phase 3 (7.40): F S F S
    ban(F),
    ban(S),
    ban(F),
    ban(S),
    // Pick phase 3: F S
    pick(F),
    pick(S),
  ],
  timing: { perTurnSec: 30, reservePerTeamSec: 130 },
  source:
    "https://www.dota2.com/patches/7.40 (Captains Mode: changed order of the first and third " +
    "ban phases); https://www.dota2.com/patches/7.34 (draft order rework, 15s first-phase bans); " +
    "https://liquipedia.net/dota2/Game_Modes (current order table, 130s reserve, timeout rules)",
  verifiedAt: "2026-09-30",
};

/** Quick drill: 4 alternating bans each, then 5 alternating picks each. Not a live-game mode. */
const PRACTICE_SIMPLE_V1: DraftRuleset = {
  id: "practice-simple",
  version: 1,
  name: "Simple practice",
  description:
    "Custom practice drill: 4 bans per team alternating, then 5 picks per team alternating. " +
    "Not the live Captain's Mode order.",
  sequence: [
    ...Array.from({ length: 8 }, (_, i) => ban(i % 2 === 0 ? F : S)),
    ...Array.from({ length: 10 }, (_, i) => pick(i % 2 === 0 ? F : S)),
  ],
  timing: { perTurnSec: 30, reservePerTeamSec: 60 },
  source: "Dota Den custom practice ruleset",
  verifiedAt: null,
};

const RULESETS: readonly DraftRuleset[] = [CM_2026_V1, PRACTICE_SIMPLE_V1];

/** The factory: resolves the exact ruleset version a draft was stored with. */
export function getRuleset(id: string, version: number): Result<DraftRuleset, RulesetError> {
  const found = RULESETS.find((r) => r.id === id && r.version === version);
  return found ? ok(found) : err({ type: "unknown_ruleset", id, version });
}

/** Latest version of each ruleset id, for choosing a ruleset when creating a draft. */
export function latestRuleset(id: string): DraftRuleset | null {
  return RULESETS.filter((r) => r.id === id).reduce<DraftRuleset | null>(
    (best, r) => (best === null || r.version > best.version ? r : best),
    null,
  );
}

export function listRulesets(): readonly DraftRuleset[] {
  return RULESETS;
}

/** Turn length for a step, in milliseconds. */
export function turnDurationMs(ruleset: DraftRuleset, stepIndex: number): number {
  const step = ruleset.sequence[stepIndex];
  return (step?.turnSec ?? ruleset.timing.perTurnSec) * 1000;
}
