/**
 * Per-match extras kept for your parsed games (pure): first purchase time of each completed
 * item, lane role, lane efficiency and the lane result. They come from the match's parsed
 * replay; anything the replay doesn't have stays null, never estimated.
 */
import type { MatchDetail, MatchPlayer } from "./match-detail";
import type { WardKind } from "./match-map";
import type { RunePickup } from "./match-runes";
import type { MatchResult } from "./player-match-fact";

/** Match details fetched per player per day for extras (the rest wait for later days). */
export const EXTRAS_PER_DAY = 10;
/**
 * Plus faster hero coaching: enough to read a whole recent history in a day or two. Each fetch
 * still draws from the one shared OpenDota budget, so free players aren't slowed down.
 */
export const PLUS_EXTRAS_PER_DAY = 100;
/** Longest one sync's after-response fill may run (the rest continues on the next sync). */
export const EXTRAS_RUN_MS = 40_000;

/** Match details a player may have fetched for extras per day. */
export function extrasPerDay(isPlus: boolean): number {
  return isPlus ? PLUS_EXTRAS_PER_DAY : EXTRAS_PER_DAY;
}
/** A lane is won or lost when one side earned at least this much more gold by minute 10. */
export const EXTRAS_LANE_MARGIN = 1.1;
/** Completed items kept per game (first purchases, in order). */
export const EXTRAS_MAX_ITEMS = 12;

export type LaneResult = "won" | "even" | "lost";

/** Wards kept per game (a support places 20–30; the rest are left out). */
export const EXTRAS_MAX_WARDS = 60;

/** Runes kept per game (a mid takes 15–25; the rest are left out). */
export const EXTRAS_MAX_RUNES = 40;

/** One ward you placed: kind, where, and when it went up and came down (seconds from the horn). */
export interface ExtrasWard {
  kind: WardKind;
  placedAt: number;
  /** null when the replay doesn't say (e.g. still up when the game ended). */
  removedAt: number | null;
  x: number;
  y: number;
}

/** Hero kills on you kept per game (a feeding game has 20+; the rest are left out). */
export const EXTRAS_MAX_DEATHS = 40;

/** How you died in one game: hero kills with their time and killer, and the rest as a count. */
export interface ExtrasDeaths {
  /** Game length, so deaths can be read per minute played. */
  durationSec: number;
  /** Deaths to an enemy hero, in order (seconds from the horn). */
  byHeroes: Array<{ time: number; killerHeroId: number }>;
  /** Deaths with no enemy hero in the kill log: creeps, towers, neutrals, Roshan, denies. */
  other: number;
}

type DeathPlayer = Pick<MatchPlayer, "playerSlot" | "heroId" | "deaths" | "laning">;

/**
 * Your deaths from the enemies' kill logs. null when your hero's internal name isn't known
 * or an enemy's kill log is missing (then the hero deaths can't be told from the rest).
 */
export function deathsOf(
  players: readonly DeathPlayer[],
  you: DeathPlayer,
  heroKeys: ReadonlyMap<number, string>,
  durationSec: number,
): ExtrasDeaths | null {
  const key = heroKeys.get(you.heroId);
  if (!key) return null;
  const radiant = (slot: number) => slot < 128;
  const enemies = players.filter((p) => radiant(p.playerSlot) !== radiant(you.playerSlot));
  if (enemies.length === 0 || enemies.some((p) => !p.laning?.killsLog)) return null;
  const byHeroes = enemies
    .flatMap((p) =>
      p
        .laning!.killsLog!.filter((k) => k.key === key)
        .map((k) => ({
          time: Math.round(k.time),
          killerHeroId: p.heroId,
        })),
    )
    .sort((a, b) => a.time - b.time);
  return {
    durationSec: Math.round(durationSec),
    byHeroes: byHeroes.slice(0, EXTRAS_MAX_DEATHS),
    other: Math.max(0, you.deaths - byHeroes.length),
  };
}

/** Your team's gold lead over a game (your side's view of the gold curve). */
export interface TeamGold {
  at20: number | null;
  maxLead: number;
  maxDeficit: number;
}

/** Your side's view of the per-minute Radiant gold lead; null without a curve. */
export function teamGold(
  radiantAdvantage: readonly number[] | null,
  side: "radiant" | "dire",
): TeamGold | null {
  const curve = (radiantAdvantage ?? []).filter(Number.isFinite);
  if (curve.length < 2) return null;
  const ours = curve.map((v) => (side === "radiant" ? v : -v));
  return {
    at20: ours.length > 20 ? Math.round(ours[20]!) : null,
    maxLead: Math.round(Math.max(0, ...ours)),
    maxDeficit: Math.round(Math.max(0, ...ours.map((v) => -v))),
  };
}

/** What we keep from one parsed game, for one player. */
export interface MatchExtras {
  accountId32: number;
  matchId: string;
  heroId: number;
  startedAt: Date;
  result: MatchResult;
  /** false when the match had no parsed replay (kept so it isn't fetched again). */
  parsed: boolean;
  /** 1 safe lane, 2 mid, 3 off lane, 4 jungle; null when unknown. */
  laneRole: number | null;
  roaming: boolean;
  /** OpenDota's lane efficiency (0–100), when given. */
  efficiencyPct: number | null;
  /** Your lane (with partners) against the lane opponents, by gold at 10 minutes. */
  laneResult: LaneResult | null;
  /**
   * Allied heroes in your lane (empty for a solo lane); null when there's no lane to read
   * (unparsed, jungle, roaming). Missing on games stored before we kept it.
   */
  lanePartnerHeroIds?: number[] | null;
  /**
   * Enemy heroes in your lane (not roaming); null when there's no lane to read. Missing on games
   * stored before we kept it.
   */
  laneOpponentHeroIds?: number[] | null;
  /**
   * Your team's net worth lead (negative: behind) from the parsed replay: at 20 minutes (null in
   * shorter games) and the biggest lead and deficit. null without the gold curve; missing on
   * games stored before we kept it.
   */
  teamGold?: TeamGold | null;
  /** First purchase of each completed item, seconds from the horn, in order. */
  itemTimings: Array<{ key: string; time: number }>;
  /** Your side in the game (ward spots differ by side). Missing on games stored before. */
  side?: "radiant" | "dire";
  /**
   * The wards you placed, in order (at most EXTRAS_MAX_WARDS); null when the replay has no
   * ward logs. Missing on games stored before we kept them.
   */
  wards?: ExtrasWard[] | null;
  /**
   * The runes you picked up, in order (at most EXTRAS_MAX_RUNES); null when the replay has no
   * rune log. Missing on games stored before we kept them.
   */
  runes?: RunePickup[] | null;
  /**
   * How you died (hero kills with time and killer, the rest counted); null when the replay or
   * the hero names don't say. Missing on games stored before we kept it.
   */
  deaths?: ExtrasDeaths | null;
}

type LanePlayer = Pick<MatchPlayer, "playerSlot" | "laning">;

/**
 * Your lane against the enemies in the same lane, by gold earned at 10 minutes. null when
 * there's no lane to compare: jungle, roaming, or nobody (with data) on one side.
 */
export function laneResult(players: readonly LanePlayer[], you: LanePlayer): LaneResult | null {
  const lane = you.laning?.lane;
  if (!you.laning || you.laning.roaming || !lane || lane < 1 || lane > 3) return null;
  const radiant = (slot: number) => slot < 128;
  const laners = players.filter(
    (p) => p.laning?.lane === lane && !p.laning.roaming && p.laning.goldAt10 !== null,
  );
  const sum = (ps: LanePlayer[]) => ps.reduce((s, p) => s + p.laning!.goldAt10!, 0);
  const ours = laners.filter((p) => radiant(p.playerSlot) === radiant(you.playerSlot));
  const theirs = laners.filter((p) => radiant(p.playerSlot) !== radiant(you.playerSlot));
  if (ours.length === 0 || theirs.length === 0 || you.laning.goldAt10 === null) return null;
  const a = sum(ours);
  const b = sum(theirs);
  if (a >= b * EXTRAS_LANE_MARGIN) return "won";
  if (b >= a * EXTRAS_LANE_MARGIN) return "lost";
  return "even";
}

/** Allied heroes laning with you (not roaming); null when you had no lane. */
export function lanePartners(
  players: readonly Pick<MatchPlayer, "playerSlot" | "heroId" | "laning">[],
  you: Pick<MatchPlayer, "playerSlot" | "laning">,
): number[] | null {
  const lane = you.laning?.lane;
  if (!you.laning || you.laning.roaming || !lane || lane < 1 || lane > 3) return null;
  const radiant = (slot: number) => slot < 128;
  return players
    .filter(
      (p) =>
        p.playerSlot !== you.playerSlot &&
        radiant(p.playerSlot) === radiant(you.playerSlot) &&
        p.laning?.lane === lane &&
        !p.laning.roaming &&
        p.heroId > 0,
    )
    .map((p) => p.heroId);
}

/** Enemy heroes laning against you (not roaming); null when you had no lane. */
export function laneOpponents(
  players: readonly Pick<MatchPlayer, "playerSlot" | "heroId" | "laning">[],
  you: Pick<MatchPlayer, "playerSlot" | "laning">,
): number[] | null {
  const lane = you.laning?.lane;
  if (!you.laning || you.laning.roaming || !lane || lane < 1 || lane > 3) return null;
  const radiant = (slot: number) => slot < 128;
  return players
    .filter(
      (p) =>
        radiant(p.playerSlot) !== radiant(you.playerSlot) &&
        p.laning?.lane === lane &&
        !p.laning.roaming &&
        p.heroId > 0,
    )
    .map((p) => p.heroId);
}

/** First purchase time of each item `isItem` accepts, in order. */
export function firstPurchases(
  purchases: readonly { time: number; key: string }[],
  isItem: (key: string) => boolean,
  limit = EXTRAS_MAX_ITEMS,
): Array<{ key: string; time: number }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; time: number }> = [];
  for (const p of [...purchases].sort((a, b) => a.time - b.time)) {
    if (seen.has(p.key) || !isItem(p.key) || !Number.isFinite(p.time)) continue;
    seen.add(p.key);
    out.push({ key: p.key, time: Math.round(p.time) });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Your extras from a fetched match. You're found by account id (or, for a private account,
 * by your hero and side from the imported game); null when you aren't in it.
 */
export function matchExtrasFrom(
  detail: MatchDetail,
  game: {
    accountId32: number;
    heroId: number;
    side: "radiant" | "dire";
    result: MatchResult;
  },
  isItem: (key: string) => boolean,
  /** Hero id → internal name, for reading kill logs; without it deaths stay null. */
  heroKeys: ReadonlyMap<number, string> | null = null,
): MatchExtras | null {
  const you =
    detail.players.find((p) => p.accountId32 === game.accountId32) ??
    detail.players.find((p) => p.heroId === game.heroId && p.side === game.side);
  if (!you) return null;
  const laning = detail.parsed ? you.laning : null;
  return {
    accountId32: game.accountId32,
    matchId: detail.matchId,
    heroId: you.heroId,
    startedAt: detail.startedAt,
    result: game.result,
    parsed: laning !== null,
    laneRole: laning?.laneRole ?? null,
    roaming: laning?.roaming ?? false,
    efficiencyPct: laning?.efficiencyPct ?? null,
    laneResult: laning ? laneResult(detail.players, you) : null,
    lanePartnerHeroIds: laning ? lanePartners(detail.players, you) : null,
    laneOpponentHeroIds: laning ? laneOpponents(detail.players, you) : null,
    teamGold: laning ? teamGold(detail.goldAdvantage, you.side) : null,
    itemTimings: laning ? firstPurchases(laning.purchases, isItem) : [],
    side: you.side,
    wards:
      laning && you.map
        ? you.map.wards.slice(0, EXTRAS_MAX_WARDS).map((w) => ({
            kind: w.kind,
            placedAt: Math.round(w.placedAt),
            removedAt: w.removedAt === null ? null : Math.round(w.removedAt),
            x: w.x,
            y: w.y,
          }))
        : null,
    runes: laning?.runes ? laning.runes.slice(0, EXTRAS_MAX_RUNES) : null,
    deaths: laning && heroKeys ? deathsOf(detail.players, you, heroKeys, detail.durationSec) : null,
  };
}
