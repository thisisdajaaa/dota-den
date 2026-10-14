/**
 * A group's games together (pure). Built from the Together feature's cached pair
 * classifications: only a confirmed party (same party id, reported party size ≥ 2) counts.
 * Members on one team without party data are counted as unknown, never as together.
 */
import type { PairClassification } from "@/modules/together/domain/pair";

type Outcome = "win" | "loss";

/** A lineup needs this many games to be ranked among the best. */
export const MIN_LINEUP_GAMES = 3;
/** Win rates are pulled toward 50% by this many games when ranking lineups. */
export const LINEUP_SHRINK_GAMES = 10;
/** Party games before a win rate is shown on its own. */
export const MIN_RATE_GAMES = 5;

export interface GroupParty {
  matchId: string;
  startedAt: Date;
  /** Members confirmed in this party, ascending (2 to 5). */
  members: number[];
  result: Outcome | null;
}

export interface WinRecord {
  games: number;
  wins: number;
}

export interface Lineup extends WinRecord {
  members: number[];
  adjustedRate: number;
}

export interface MemberPartyRecord extends WinRecord {
  accountId32: number;
}

export interface GroupPartyStats {
  /** Every party of two or more members, counted once per party (newest first). */
  parties: GroupParty[];
  record: WinRecord & { decided: number };
  /** Lineups with at least MIN_LINEUP_GAMES decided games, best first. */
  lineups: Lineup[];
  /** Lineups seen fewer than MIN_LINEUP_GAMES times (not ranked). */
  smallLineups: number;
  members: MemberPartyRecord[];
  /** Matches where members shared a team but party data was missing: not counted. */
  unknownGames: number;
  lastPlayedAt: Date | null;
}

function find(parent: Map<number, number>, x: number): number {
  let root = x;
  while (parent.get(root) !== root) root = parent.get(root)!;
  parent.set(x, root);
  return root;
}

function resultOf(rows: readonly PairClassification[], accountId32: number): Outcome | null {
  for (const r of rows) {
    if (r.radiantWin === null) continue;
    const seat =
      r.accountIdA === accountId32 ? r.seatA : r.accountIdB === accountId32 ? r.seatB : null;
    if (seat) return (seat.side === "radiant") === r.radiantWin ? "win" : "loss";
  }
  return null;
}

/**
 * The group's parties per match. Members linked by confirmed party pairs are one party
 * (they share one party id); two separate parties in one match are kept apart.
 */
export function groupParties(
  rows: readonly PairClassification[],
  memberIds: readonly number[],
): { parties: GroupParty[]; unknownGames: number } {
  const members = new Set(memberIds);
  const byMatch = new Map<string, PairClassification[]>();
  for (const r of rows) {
    if (!members.has(r.accountIdA) || !members.has(r.accountIdB)) continue;
    byMatch.set(r.matchId, [...(byMatch.get(r.matchId) ?? []), r]);
  }

  const parties: GroupParty[] = [];
  let unknownGames = 0;
  for (const [matchId, matchRows] of byMatch) {
    const partyRows = matchRows.filter((r) => r.relation === "party");
    const parent = new Map<number, number>();
    for (const r of partyRows) {
      for (const id of [r.accountIdA, r.accountIdB]) if (!parent.has(id)) parent.set(id, id);
      parent.set(find(parent, r.accountIdA), find(parent, r.accountIdB));
    }
    const groups = new Map<number, number[]>();
    for (const id of parent.keys()) {
      const root = find(parent, id);
      groups.set(root, [...(groups.get(root) ?? []), id]);
    }
    for (const ids of groups.values()) {
      const sorted = ids.sort((a, b) => a - b);
      const own = partyRows.filter((r) => sorted.includes(r.accountIdA));
      parties.push({
        matchId,
        startedAt: matchRows[0].startedAt,
        members: sorted,
        result: resultOf(own, sorted[0]),
      });
    }
    // Unknown: a pair on one team without party data, not already joined by a confirmed party.
    const unknown = matchRows.some(
      (r) =>
        r.relation === "same_team_unknown" &&
        !(
          parent.has(r.accountIdA) &&
          parent.has(r.accountIdB) &&
          find(parent, r.accountIdA) === find(parent, r.accountIdB)
        ),
    );
    if (unknown) unknownGames++;
  }
  parties.sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.matchId.localeCompare(a.matchId),
  );
  return { parties, unknownGames };
}

const adjusted = (r: WinRecord) =>
  (r.wins + LINEUP_SHRINK_GAMES * 0.5) / (r.games + LINEUP_SHRINK_GAMES);

export const rateOf = (r: WinRecord): number | null => (r.games > 0 ? r.wins / r.games : null);

/** Record, lineups and per-member records from the group's parties. */
export function groupPartyStats(
  rows: readonly PairClassification[],
  memberIds: readonly number[],
): GroupPartyStats {
  const { parties, unknownGames } = groupParties(rows, memberIds);
  const decided = parties.filter((p) => p.result !== null);
  const wins = decided.filter((p) => p.result === "win").length;

  const byLineup = new Map<string, Lineup>();
  for (const p of decided) {
    const key = p.members.join(":");
    const l = byLineup.get(key) ?? { members: p.members, games: 0, wins: 0, adjustedRate: 0 };
    l.games++;
    if (p.result === "win") l.wins++;
    byLineup.set(key, l);
  }
  const all = [...byLineup.values()].map((l) => ({ ...l, adjustedRate: adjusted(l) }));
  const lineups = all
    .filter((l) => l.games >= MIN_LINEUP_GAMES)
    .sort(
      (a, b) =>
        b.adjustedRate - a.adjustedRate ||
        b.games - a.games ||
        a.members.join(":").localeCompare(b.members.join(":")),
    );

  const members = memberIds.map((accountId32) => {
    const mine = decided.filter((p) => p.members.includes(accountId32));
    return {
      accountId32,
      games: mine.length,
      wins: mine.filter((p) => p.result === "win").length,
    };
  });

  return {
    parties,
    record: { games: parties.length, decided: decided.length, wins },
    lineups,
    smallLineups: all.length - lineups.length,
    members,
    unknownGames,
    lastPlayedAt: parties[0]?.startedAt ?? null,
  };
}
