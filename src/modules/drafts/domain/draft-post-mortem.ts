/**
 * Draft post-mortem (pure): what the draft said before a real game, set against what happened
 * in it. Everything here is measured from the match itself (gold earned by minute 10 in each
 * lane, the per-minute gold advantage, each hero's line) or read from the draft outlook; no
 * cause is invented. Where the replay isn't parsed, the parts that need it are left out.
 */
import type { LaneMatchup, OutlookHero } from "./draft-outlook";
import type { Side } from "./draft-state";

export type LaneKey = LaneMatchup["lane"];

/** One player as the post-mortem needs them (from the match, parsed fields may be null). */
export interface PostMortemPlayer {
  side: Side;
  heroId: number;
  /** Physical lane from the parsed replay: 1 bottom, 2 middle, 3 top, 4/5 jungle. */
  lane: number | null;
  roaming: boolean;
  /** Gold earned by minute 10 (parsed only). */
  goldAt10: number | null;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number | null;
  heroDamage: number | null;
}

export interface PostMortemInput {
  radiantWin: boolean;
  durationSec: number;
  /** Per-minute Radiant gold advantage (parsed only). */
  goldAdvantage: readonly number[] | null;
  players: readonly PostMortemPlayer[];
  /** The draft outlook's lanes and heroes for these lineups. */
  lanes: readonly LaneMatchup[];
  heroes: readonly OutlookHero[];
}

export interface LaneResult {
  lane: LaneKey;
  /** Heroes that actually laned there (not roaming), per side. */
  radiant: number[];
  dire: number[];
  /** Radiant's laners' gold by minute 10 minus Dire's. */
  goldDiff: number;
  /** Who came out ahead; null when within EVEN_LANE_GOLD. */
  winner: Side | null;
  /** Who the draft expected to win the lane; null when it had no clear read. */
  expected: Side | null;
  verdict: "as_drafted" | "against_draft" | "no_read";
}

export const SWING_PHASES = ["laning", "mid", "late"] as const;
export type SwingPhase = (typeof SWING_PHASES)[number];

export interface PhaseSwing {
  phase: SwingPhase;
  fromMinute: number;
  toMinute: number;
  /** Change in Radiant's gold advantage over the phase. */
  radiantChange: number;
}

export interface HeroLine {
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number | null;
}

/** A counter the draft liked, and how both heroes' games went. */
export interface CounterResult {
  side: Side;
  /** The draft's head-to-head edge for `hero` against `vs` (points). */
  edge: number;
  hero: HeroLine;
  vs: HeroLine;
}

export interface PostMortem {
  winner: Side;
  durationMin: number;
  /** Lanes from the parsed replay; null when it isn't parsed. */
  lanes: LaneResult[] | null;
  /** Gold advantage change per phase the game reached; null without a parsed replay. */
  swings: PhaseSwing[] | null;
  /** The phase where the winner gained the most, when it gained anything. */
  decidedIn: SwingPhase | null;
  /** The winner's biggest deficit and when; null when they were never behind by much. */
  comeback: { gold: number; minute: number } | null;
  /** The minute the winner took the lead for good; null without the series. */
  leadForGoodFrom: number | null;
  counters: CounterResult[];
}

/** A lane closer than this in gold earned by minute 10 counts as even. */
export const EVEN_LANE_GOLD = 500;
/** A draft lane edge below this many points isn't a read either way. */
const LANE_EDGE_READ = 1;
/** Being behind by at least this much and winning is called a comeback. */
export const COMEBACK_GOLD = 3_000;
/** Only counters the draft rated at least this strongly are worth following up. */
const COUNTER_EDGE = 1.5;
const PHASE_BOUNDS: Record<SwingPhase, [number, number]> = {
  laning: [0, 10],
  mid: [10, 25],
  late: [25, Number.POSITIVE_INFINITY],
};
const LANE_OF: Record<number, LaneKey> = { 1: "radiant_safe", 2: "mid", 3: "radiant_off" };

const sideOf = (n: number, threshold: number): Side | null =>
  n >= threshold ? "radiant" : n <= -threshold ? "dire" : null;

function laneResults(input: PostMortemInput): LaneResult[] | null {
  const laners = input.players.filter(
    (p) => p.lane !== null && p.lane in LANE_OF && !p.roaming && p.goldAt10 !== null,
  );
  if (laners.length === 0) return null;
  const out: LaneResult[] = [];
  for (const [n, lane] of Object.entries(LANE_OF)) {
    const here = laners.filter((p) => p.lane === Number(n));
    const radiant = here.filter((p) => p.side === "radiant");
    const dire = here.filter((p) => p.side === "dire");
    if (radiant.length === 0 || dire.length === 0) continue;
    const gold = (ps: PostMortemPlayer[]) => ps.reduce((s, p) => s + (p.goldAt10 ?? 0), 0);
    const goldDiff = gold(radiant) - gold(dire);
    const drafted = input.lanes.find((l) => l.lane === lane);
    const expected = drafted?.edge != null ? sideOf(drafted.edge, LANE_EDGE_READ) : null;
    const winner = sideOf(goldDiff, EVEN_LANE_GOLD);
    out.push({
      lane,
      radiant: radiant.map((p) => p.heroId),
      dire: dire.map((p) => p.heroId),
      goldDiff,
      winner,
      expected,
      verdict:
        expected === null || winner === null
          ? "no_read"
          : expected === winner
            ? "as_drafted"
            : "against_draft",
    });
  }
  return out.length ? out : null;
}

function swings(adv: readonly number[]): PhaseSwing[] {
  const last = adv.length - 1;
  return SWING_PHASES.flatMap((phase) => {
    const [from, to] = PHASE_BOUNDS[phase];
    if (last <= from) return [];
    const end = Math.min(to, last);
    return [{ phase, fromMinute: from, toMinute: end, radiantChange: adv[end] - adv[from] }];
  });
}

function line(p: PostMortemPlayer): HeroLine {
  return {
    heroId: p.heroId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    netWorth: p.netWorth,
  };
}

/** Each side's strongest counter in the draft (one per side), with both heroes' games. */
function counterResults(input: PostMortemInput): CounterResult[] {
  const byName = new Map(input.heroes.map((h) => [h.name, h]));
  const player = (heroId: number) => input.players.find((p) => p.heroId === heroId);
  return (["radiant", "dire"] as const).flatMap((side) => {
    const best = input.heroes
      .filter((h) => h.side === side && h.bestMatchup && h.bestMatchup.edge >= COUNTER_EDGE)
      .sort((a, b) => b.bestMatchup!.edge - a.bestMatchup!.edge)[0];
    if (!best) return [];
    const target = byName.get(best.bestMatchup!.name);
    const mine = player(best.heroId);
    const theirs = target && target.side !== side ? player(target.heroId) : undefined;
    if (!mine || !theirs) return [];
    return [{ side, edge: best.bestMatchup!.edge, hero: line(mine), vs: line(theirs) }];
  });
}

export function draftPostMortem(input: PostMortemInput): PostMortem {
  const winner: Side = input.radiantWin ? "radiant" : "dire";
  const sign = winner === "radiant" ? 1 : -1;
  const adv = input.goldAdvantage && input.goldAdvantage.length > 1 ? input.goldAdvantage : null;

  let decidedIn: SwingPhase | null = null;
  let comeback: PostMortem["comeback"] = null;
  let leadForGoodFrom: number | null = null;
  const phaseSwings = adv ? swings(adv) : null;
  if (adv && phaseSwings) {
    const gains = phaseSwings.map((s) => ({ phase: s.phase, gain: s.radiantChange * sign }));
    const top = gains.reduce((a, b) => (b.gain > a.gain ? b : a), gains[0]);
    decidedIn = top && top.gain > 0 ? top.phase : null;
    let worst = 0;
    let worstAt = 0;
    adv.forEach((v, minute) => {
      if (v * sign < worst) {
        worst = v * sign;
        worstAt = minute;
      }
    });
    comeback = -worst >= COMEBACK_GOLD ? { gold: -worst, minute: worstAt } : null;
    let from = adv.length;
    for (let m = adv.length - 1; m >= 0 && adv[m] * sign > 0; m--) from = m;
    leadForGoodFrom = from < adv.length ? from : null;
  }

  return {
    winner,
    durationMin: Math.round(input.durationSec / 60),
    lanes: laneResults(input),
    swings: phaseSwings,
    decidedIn,
    comeback,
    leadForGoodFrom,
    counters: counterResults(input),
  };
}
