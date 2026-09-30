import type { RoomCaptain } from "./draft-room";
import type { Side } from "./draft-state";

/**
 * A permanent record of a finished room draft. Rooms expire a day after their last move;
 * this record does not, so two friends can look back at the drafts they did together.
 */

/** What a captain said happened in the real game. Self-reported and never verified. */
export type ReportedWinner = "radiant" | "dire" | "not_played";

export interface ReportedResult {
  winner: ReportedWinner;
  setBy: { userId: string; name: string };
  setAt: Date;
}

export interface DraftHistoryRecord {
  roomId: string;
  completedAt: Date;
  rulesetId: string;
  rulesetVersion: number;
  firstSide: Side;
  captains: Record<Side, RoomCaptain>;
  /** Hero ids in the order they were chosen. Bans skipped by the timer are left out. */
  sides: Record<Side, { picks: number[]; bans: number[] }>;
  /** Encoded draft snapshot for the read-only `/draft?snapshot=` view. */
  snapshot: string;
  rematchOf: string | null;
  /** The first room of a rematch chain (this room's id when it isn't a rematch). */
  chainId: string;
  result: ReportedResult | null;
}

export function historySideOf(record: DraftHistoryRecord, userId: string): Side | null {
  if (record.captains.radiant.userId === userId) return "radiant";
  if (record.captains.dire.userId === userId) return "dire";
  return null;
}

export type ViewerOutcome = "won" | "lost" | "not_played";

/** The reported result from one captain's point of view, or null when nobody reported it. */
export function outcomeFor(record: DraftHistoryRecord, side: Side): ViewerOutcome | null {
  const r = record.result;
  if (!r) return null;
  if (r.winner === "not_played") return "not_played";
  return r.winner === side ? "won" : "lost";
}

export interface HeroCount {
  heroId: number;
  count: number;
}

export interface HeadToHead {
  drafts: number;
  /** Only drafts where a captain reported a winner count here. */
  wins: number;
  losses: number;
  /** A captain said the game wasn't played. */
  notPlayed: number;
  /** Nobody has reported a result yet. */
  unreported: number;
  yourPicks: HeroCount[];
  friendPicks: HeroCount[];
  /** Heroes your friend banned in these drafts. */
  bannedAgainstYou: HeroCount[];
}

function top(counts: Map<number, number>, limit: number): HeroCount[] {
  return [...counts]
    .map(([heroId, count]) => ({ heroId, count }))
    .sort((a, b) => b.count - a.count || a.heroId - b.heroId)
    .slice(0, limit);
}

function tally(counts: Map<number, number>, heroIds: readonly number[]): void {
  for (const id of heroIds) counts.set(id, (counts.get(id) ?? 0) + 1);
}

/**
 * Head-to-head summary for the viewer across drafts with one friend. The record only
 * counts drafts where someone reported which side won; everything else is counted apart.
 */
export function headToHead(
  records: readonly DraftHistoryRecord[],
  viewerUserId: string,
  limit = 5,
): HeadToHead {
  const summary: HeadToHead = {
    drafts: 0,
    wins: 0,
    losses: 0,
    notPlayed: 0,
    unreported: 0,
    yourPicks: [],
    friendPicks: [],
    bannedAgainstYou: [],
  };
  const yours = new Map<number, number>();
  const theirs = new Map<number, number>();
  const bans = new Map<number, number>();
  for (const record of records) {
    const side = historySideOf(record, viewerUserId);
    if (!side) continue;
    const other: Side = side === "radiant" ? "dire" : "radiant";
    summary.drafts++;
    const outcome = outcomeFor(record, side);
    if (outcome === "won") summary.wins++;
    else if (outcome === "lost") summary.losses++;
    else if (outcome === "not_played") summary.notPlayed++;
    else summary.unreported++;
    tally(yours, record.sides[side].picks);
    tally(theirs, record.sides[other].picks);
    tally(bans, record.sides[other].bans);
  }
  summary.yourPicks = top(yours, limit);
  summary.friendPicks = top(theirs, limit);
  summary.bannedAgainstYou = top(bans, limit);
  return summary;
}
