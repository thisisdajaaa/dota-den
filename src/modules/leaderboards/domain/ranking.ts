import type { DraftGrade } from "./draft-score";

/**
 * Leaderboard ranking (pure). Each board turns per-player totals into standings, orders them
 * by its metrics and gives tied players the same rank ("1, 1, 3").
 */

export const BOARDS = ["drafts", "challenges", "rooms"] as const;
export type BoardKind = (typeof BOARDS)[number];

export function isBoardKind(value: unknown): value is BoardKind {
  return typeof value === "string" && (BOARDS as readonly string[]).includes(value);
}

export const SCOPES = ["friends", "everyone"] as const;
export type Scope = (typeof SCOPES)[number];

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/** Completed drafts against the AI captain or in practice, per player. */
export interface DraftTotals {
  userId: string;
  drafts: number;
  /** Drafts that have a draft score (practice drafts have none). */
  scored: number;
  scoreSum: number;
  bestScore: number | null;
  /** The report card grade of the best-scored draft, when it had one. */
  bestGrade: DraftGrade | null;
}

/** First answers to draft challenges, per player. */
export interface ChallengeTotals {
  userId: string;
  answered: number;
  correct: number;
  /** Longest run of correct answers in the period. */
  bestStreak: number;
}

/** Finished room drafts a player captained, with the self-reported results. */
export interface RoomTotals {
  userId: string;
  drafts: number;
  wins: number;
  losses: number;
}

export interface DraftStanding {
  userId: string;
  drafts: number;
  avgScore: number | null;
  bestScore: number | null;
  bestGrade: DraftGrade | null;
}

export interface ChallengeStanding {
  userId: string;
  correct: number;
  answered: number;
  /** correct / answered (0–1). */
  accuracy: number | null;
  bestStreak: number;
}

export interface RoomStanding {
  userId: string;
  drafts: number;
  wins: number;
  losses: number;
}

export type Ranked<T> = T & { rank: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function draftStanding(t: DraftTotals): DraftStanding {
  return {
    userId: t.userId,
    drafts: t.drafts,
    avgScore: t.scored > 0 ? round1(t.scoreSum / t.scored) : null,
    bestScore: t.bestScore === null ? null : round1(t.bestScore),
    bestGrade: t.bestScore === null ? null : t.bestGrade,
  };
}

export function challengeStanding(t: ChallengeTotals): ChallengeStanding {
  return {
    userId: t.userId,
    correct: t.correct,
    answered: t.answered,
    accuracy: t.answered > 0 ? t.correct / t.answered : null,
    bestStreak: t.bestStreak,
  };
}

export function roomStanding(t: RoomTotals): RoomStanding {
  return { userId: t.userId, drafts: t.drafts, wins: t.wins, losses: t.losses };
}

/** Metrics compared in order, higher first. A missing value sorts below any number. */
type SortKeys = ReadonlyArray<number | null>;

function compareKeys(a: SortKeys, b: SortKeys): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? null;
    const y = b[i] ?? null;
    if (x === y) continue;
    if (x === null) return 1;
    if (y === null) return -1;
    if (x !== y) return y - x;
  }
  return 0;
}

/**
 * Order rows by their keys and rank them. Rows with equal keys share a rank and the next
 * rank skips ahead ("1, 1, 3"); within a tie, rows keep a stable order by user id.
 */
export function rankBy<T extends { userId: string }>(
  rows: readonly T[],
  keys: (row: T) => SortKeys,
): Ranked<T>[] {
  const sorted = [...rows].sort(
    (a, b) => compareKeys(keys(a), keys(b)) || a.userId.localeCompare(b.userId),
  );
  const out: Ranked<T>[] = [];
  sorted.forEach((row, i) => {
    const prev = out[i - 1];
    const tied = prev !== undefined && compareKeys(keys(prev), keys(row)) === 0;
    out.push({ ...row, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}

/** Most completed drafts, then best score, then average score. */
export const DRAFT_KEYS = (s: DraftStanding): SortKeys => [s.drafts, s.bestScore, s.avgScore];
/** Most correct answers, then best streak, then accuracy. */
export const CHALLENGE_KEYS = (s: ChallengeStanding): SortKeys => [
  s.correct,
  s.bestStreak,
  s.accuracy,
];
/** Most room drafts, then most (self-reported) wins. */
export const ROOM_KEYS = (s: RoomStanding): SortKeys => [s.drafts, s.wins];

/** Only players who did something in the period appear on a board. */
export function hasActivity(s: DraftStanding | ChallengeStanding | RoomStanding): boolean {
  return "answered" in s ? s.answered > 0 : s.drafts > 0;
}

/**
 * Keep the rows of the players in scope. `members` null means everyone. Friends boards pass
 * the viewer and their friends' user ids.
 */
export function inScope<T extends { userId: string }>(
  rows: readonly T[],
  members: ReadonlySet<string> | null,
): T[] {
  return members === null ? [...rows] : rows.filter((r) => members.has(r.userId));
}

/**
 * The first `limit` rows, plus the viewer's own row when it falls below the cut (so you
 * always see where you stand).
 */
export function topWithViewer<T extends { userId: string }>(
  ranked: readonly T[],
  viewerId: string,
  limit: number,
): { rows: T[]; viewerBelowCut: T | null } {
  const rows = ranked.slice(0, limit);
  const viewer = ranked.find((r) => r.userId === viewerId) ?? null;
  const shown = rows.some((r) => r.userId === viewerId);
  return { rows, viewerBelowCut: viewer && !shown ? viewer : null };
}
