import type { Relation } from "./relation";

/** Party games needed before a win rate together is compared with anything. */
export const MIN_TOGETHER_GAMES = 10;
/** Other games needed in the same period for a baseline. */
export const MIN_BASELINE_GAMES = 10;
/** Games a hero pairing needs before it is listed. */
export const MIN_HERO_PAIR_GAMES = 3;
/** Games shown in "recent form together". */
export const FORM_LENGTH = 10;

type Outcome = "win" | "loss";

/** One shared match from the signed-in player's point of view. */
export interface SharedGame {
  matchId: string;
  startedAt: Date;
  relation: Relation;
  /** The signed-in player's result. */
  result: Outcome;
  myHeroId: number;
  /** null when the match detail couldn't tell us. */
  friendHeroId: number | null;
}

export interface WinRecord {
  games: number;
  wins: number;
}

export const rateOf = (r: WinRecord): number | null => (r.games > 0 ? r.wins / r.games : null);

export interface PairSummary {
  /** Confirmed party games only. */
  together: WinRecord;
  winRate: number | null;
  /** Newest first, confirmed party games only. */
  form: Array<{ matchId: string; result: Outcome; heroId: number }>;
  lastPlayedAt: Date | null;
  firstPlayedAt: Date | null;
  /** Shared matches per relation (every relation, including party). */
  byRelation: { [K in Relation]: number };
}

const newestFirst = <T extends { startedAt: Date }>(xs: readonly T[]): T[] =>
  [...xs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

export function summarisePair(games: readonly SharedGame[]): PairSummary {
  const byRelation: PairSummary["byRelation"] = {
    party: 0,
    same_team_separate: 0,
    same_team_unknown: 0,
    opponents: 0,
    undetermined: 0,
  };
  for (const g of games) byRelation[g.relation]++;
  const party = newestFirst(games.filter((g) => g.relation === "party"));
  const together = { games: party.length, wins: party.filter((g) => g.result === "win").length };
  return {
    together,
    winRate: rateOf(together),
    form: party
      .slice(0, FORM_LENGTH)
      .map((g) => ({ matchId: g.matchId, result: g.result, heroId: g.myHeroId })),
    lastPlayedAt: party[0]?.startedAt ?? null,
    firstPlayedAt: party.at(-1)?.startedAt ?? null,
    byRelation,
  };
}

export interface HeroPair extends WinRecord {
  myHeroId: number;
  friendHeroId: number;
  winRate: number | null;
}

/** Hero combinations in confirmed party games, most played first; pairs under `min` games dropped. */
export function heroPairs(games: readonly SharedGame[], min = MIN_HERO_PAIR_GAMES): HeroPair[] {
  const byKey = new Map<string, HeroPair>();
  for (const g of games) {
    if (g.relation !== "party" || g.friendHeroId === null) continue;
    const key = `${g.myHeroId}:${g.friendHeroId}`;
    const row = byKey.get(key) ?? {
      myHeroId: g.myHeroId,
      friendHeroId: g.friendHeroId,
      games: 0,
      wins: 0,
      winRate: null,
    };
    row.games++;
    if (g.result === "win") row.wins++;
    byKey.set(key, row);
  }
  return [...byKey.values()]
    .filter((r) => r.games >= min)
    .map((r) => ({ ...r, winRate: rateOf(r) }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.myHeroId - b.myHeroId);
}

/** One of the signed-in player's own games (from their imported history). */
export interface OwnGame {
  matchId: string;
  startedAt: Date;
  result: Outcome;
}

/**
 * The player's usual record over the same period: every own game from the first confirmed
 * party game onward, minus the games with this friend. Null when there's no period yet.
 */
export function baselineRecord(
  own: readonly OwnGame[],
  summary: Pick<PairSummary, "firstPlayedAt">,
  excludeMatchIds: ReadonlySet<string>,
): WinRecord | null {
  const from = summary.firstPlayedAt;
  if (!from) return null;
  const rows = own.filter(
    (g) => g.startedAt.getTime() >= from.getTime() && !excludeMatchIds.has(g.matchId),
  );
  return { games: rows.length, wins: rows.filter((g) => g.result === "win").length };
}

export type BaselineComparison =
  | { kind: "too_few_together"; games: number; needed: number }
  | { kind: "no_baseline"; games: number; needed: number }
  | { kind: "compared"; togetherRate: number; baselineRate: number; delta: number };

/**
 * Compare a win rate together with the usual one. No comparison below the sample thresholds:
 * with few games the difference is mostly noise.
 */
export function compareWithBaseline(
  together: WinRecord,
  baseline: WinRecord | null,
): BaselineComparison {
  if (together.games < MIN_TOGETHER_GAMES)
    return { kind: "too_few_together", games: together.games, needed: MIN_TOGETHER_GAMES };
  if (!baseline || baseline.games < MIN_BASELINE_GAMES)
    return { kind: "no_baseline", games: baseline?.games ?? 0, needed: MIN_BASELINE_GAMES };
  const togetherRate = together.wins / together.games;
  const baselineRate = baseline.wins / baseline.games;
  return { kind: "compared", togetherRate, baselineRate, delta: togetherRate - baselineRate };
}

/** A confirmed party game between the player and one friend (for trio detection). */
export interface PartyLink {
  matchId: string;
  friendId: number;
  result: Outcome | null;
}

export interface Trio extends WinRecord {
  /** The two friends, ascending. */
  friends: [number, number];
  lastMatchId: string;
}

/**
 * Trios: matches where the player was in a confirmed party with two friends. Being in the
 * player's party in the same match means all three shared one party id.
 */
export function topTrios(links: readonly PartyLink[], limit = 5): Trio[] {
  const byMatch = new Map<string, PartyLink[]>();
  for (const l of links) byMatch.set(l.matchId, [...(byMatch.get(l.matchId) ?? []), l]);

  const trios = new Map<string, Trio>();
  // Match ids are numeric and grow over time; newest last after this sort.
  const matchIds = [...byMatch.keys()].sort((a, b) =>
    a.length === b.length ? a.localeCompare(b) : a.length - b.length,
  );
  for (const matchId of matchIds) {
    const rows = byMatch.get(matchId)!;
    const friends = [...new Set(rows.map((r) => r.friendId))].sort((a, b) => a - b);
    const result = rows.find((r) => r.result !== null)?.result ?? null;
    for (let i = 0; i < friends.length; i++) {
      for (let j = i + 1; j < friends.length; j++) {
        const key = `${friends[i]}:${friends[j]}`;
        const t = trios.get(key) ?? {
          friends: [friends[i], friends[j]] as [number, number],
          games: 0,
          wins: 0,
          lastMatchId: matchId,
        };
        t.games++;
        if (result === "win") t.wins++;
        t.lastMatchId = matchId;
        trios.set(key, t);
      }
    }
  }
  return [...trios.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, limit);
}

export interface Stack extends WinRecord {
  /** Friends in the party with you (ascending): 1 for a duo, 2 for a trio, up to 4. */
  friends: number[];
  /** Win rate pulled toward 50% by STACK_SHRINK_GAMES games, for ranking small samples. */
  adjustedRate: number;
}

/** Stacks need this many games to be ranked. */
export const MIN_STACK_GAMES = 3;
export const STACK_SHRINK_GAMES = 10;

/**
 * Your parties by exactly who was in them (among friends whose games have been analysed),
 * ranked by a win rate pulled toward 50%. Only confirmed parties: the links come from party
 * matches.
 */
export function bestStacks(links: readonly PartyLink[], limit = 8): Stack[] {
  const byMatch = new Map<string, PartyLink[]>();
  for (const l of links) byMatch.set(l.matchId, [...(byMatch.get(l.matchId) ?? []), l]);
  const stacks = new Map<string, Stack>();
  for (const rows of byMatch.values()) {
    const result = rows.find((r) => r.result !== null)?.result ?? null;
    if (result === null) continue;
    const friends = [...new Set(rows.map((r) => r.friendId))].sort((a, b) => a - b);
    const key = friends.join(":");
    const s = stacks.get(key) ?? { friends, games: 0, wins: 0, adjustedRate: 0 };
    s.games++;
    if (result === "win") s.wins++;
    stacks.set(key, s);
  }
  return [...stacks.values()]
    .filter((s) => s.games >= MIN_STACK_GAMES)
    .map((s) => ({
      ...s,
      adjustedRate: (s.wins + STACK_SHRINK_GAMES * 0.5) / (s.games + STACK_SHRINK_GAMES),
    }))
    .sort((a, b) => b.adjustedRate - a.adjustedRate || b.games - a.games)
    .slice(0, limit);
}
