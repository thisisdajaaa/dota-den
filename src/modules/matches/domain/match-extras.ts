/**
 * Per-match extras kept for your parsed games (pure): first purchase time of each completed
 * item, lane role, lane efficiency and the lane result. They come from the match's parsed
 * replay; anything the replay doesn't have stays null, never estimated.
 */
import type { MatchDetail, MatchPlayer } from "./match-detail";
import type { MatchResult } from "./player-match-fact";

/** Match details fetched per player per day for extras (the rest wait for later days). */
export const EXTRAS_PER_DAY = 10;
/** A lane is won or lost when one side earned at least this much more gold by minute 10. */
export const EXTRAS_LANE_MARGIN = 1.1;
/** Completed items kept per game (first purchases, in order). */
export const EXTRAS_MAX_ITEMS = 12;

export type LaneResult = "won" | "even" | "lost";

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
  /** First purchase of each completed item, seconds from the horn, in order. */
  itemTimings: Array<{ key: string; time: number }>;
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
    itemTimings: laning ? firstPurchases(laning.purchases, isItem) : [],
  };
}
