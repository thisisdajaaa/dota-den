/**
 * Build check (pure): your item timings on a hero against Legend–Immortal pub games at the
 * same position, with at most one suggestion. Yours come from the stored extras of your
 * parsed games (first purchase of each completed item); theirs from STRATZ's last full week
 * (the minute by which half of the purchases were made). Both are medians. Nothing is
 * estimated: an item without enough games on either side is left out.
 */
import { median, type CoachingGame } from "./hero-coaching";

export type BuildCheckPosition = 1 | 2 | 3 | 4 | 5;

/** One item at one position in high-rank pubs (STRATZ). */
export interface HighRankItem {
  itemId: number;
  games: number;
  /** Minute by which half of its purchases were made; null for starting items. */
  minute: number | null;
}

export interface HighRankPosition {
  position: BuildCheckPosition;
  games: number;
  items: readonly HighRankItem[];
}

/** Your games in the role needed before anything is compared. */
export const MIN_ROLE_GAMES = 5;
/** Your games with the item needed for its timing. */
export const MIN_ITEM_GAMES = 3;
/** High-rank games at the position needed (a week of a rarely played role is noise). */
export const MIN_POSITION_GAMES = 200;
/** Only items at least this share of the position's high-rank games bought. */
export const MIN_ITEM_SHARE = 0.1;
/** A gap this big (seconds) is worth a suggestion. */
export const SUGGEST_GAP_SEC = 120;
/** Items shown, in the order you buy them. */
export const MAX_ROWS = 6;

/** Lane role (from the replay) to the positions it can be. Jungle has no counterpart. */
const ROLE_POSITIONS: Record<number, BuildCheckPosition[]> = { 1: [1, 5], 2: [2], 3: [3, 4] };

export interface BuildCheckRow {
  key: string;
  /** Your median first purchase (seconds) and from how many games. */
  yours: { median: number; games: number };
  /** High-rank median purchase (seconds) and in how many games it was bought. */
  theirs: { median: number; games: number };
  /** yours − theirs, in seconds (positive: you're later). */
  gap: number;
}

export type BuildCheck =
  | {
      status: "ok";
      position: BuildCheckPosition;
      /** Your analysed games in the role (the sample). */
      yourGames: number;
      /** High-rank games at the position (the week's sample). */
      theirGames: number;
      rows: BuildCheckRow[];
      /** Your biggest delay, when it's at least SUGGEST_GAP_SEC; else null (on pace). */
      suggestion: BuildCheckRow | null;
    }
  | { status: "not_enough"; yourGames: number; minGames: number }
  | { status: "no_role" };

/**
 * Your most played lane role among the games, and the high-rank position it compares with:
 * of the positions the role can be, the one the hero is played at most in high-rank pubs.
 */
function pickPosition(
  games: readonly CoachingGame[],
  positions: readonly HighRankPosition[],
): { role: number; position: HighRankPosition } | null {
  const counts = new Map<number, number>();
  for (const g of games) {
    if (g.laneRole !== null && ROLE_POSITIONS[g.laneRole]) {
      counts.set(g.laneRole, (counts.get(g.laneRole) ?? 0) + 1);
    }
  }
  const role = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  if (role === undefined) return null;
  const candidates = positions
    .filter((p) => ROLE_POSITIONS[role].includes(p.position) && p.games >= MIN_POSITION_GAMES)
    .sort((a, b) => b.games - a.games);
  return candidates[0] ? { role, position: candidates[0] } : null;
}

export function buildCheck(
  games: readonly CoachingGame[],
  positions: readonly HighRankPosition[],
  keyOf: (itemId: number) => string | undefined,
  isItem: (key: string) => boolean,
): BuildCheck {
  const picked = pickPosition(games, positions);
  if (!picked) return { status: "no_role" };
  const inRole = games.filter((g) => g.laneRole === picked.role && !g.roaming);
  if (inRole.length < MIN_ROLE_GAMES)
    return { status: "not_enough", yourGames: inRole.length, minGames: MIN_ROLE_GAMES };

  const theirs = new Map<string, HighRankItem>();
  for (const item of picked.position.items) {
    const key = keyOf(item.itemId);
    if (!key || !isItem(key) || item.minute === null) continue;
    if (item.games < picked.position.games * MIN_ITEM_SHARE) continue;
    const seen = theirs.get(key);
    if (!seen || item.games > seen.games) theirs.set(key, item);
  }

  const times = new Map<string, number[]>();
  for (const g of inRole) {
    for (const t of g.itemTimings) {
      if (!theirs.has(t.key)) continue;
      times.set(t.key, [...(times.get(t.key) ?? []), t.time]);
    }
  }

  const rows: BuildCheckRow[] = [];
  for (const [key, list] of times) {
    if (list.length < MIN_ITEM_GAMES) continue;
    const hr = theirs.get(key)!;
    const yours = median(list)!;
    const theirMedian = Math.round(hr.minute! * 60);
    rows.push({
      key,
      yours: { median: Math.round(yours), games: list.length },
      theirs: { median: theirMedian, games: hr.games },
      gap: Math.round(yours) - theirMedian,
    });
  }
  rows.sort((a, b) => a.yours.median - b.yours.median || a.key.localeCompare(b.key));
  const shown = rows.slice(0, MAX_ROWS);
  const worst = [...shown].sort((a, b) => b.gap - a.gap)[0];
  return {
    status: "ok",
    position: picked.position.position,
    yourGames: inRole.length,
    theirGames: picked.position.games,
    rows: shown,
    suggestion: worst && worst.gap >= SUGGEST_GAP_SEC ? worst : null,
  };
}
