import { describe, expect, it } from "vitest";
import {
  joinRefusal,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_PER_USER,
  memberPairs,
  nextOwner,
  normaliseGroupName,
  PAIR_REFRESH_MS,
  pairKey,
  pairsToRefresh,
  type GroupMember,
} from "@/modules/groups/domain/group";
import {
  groupParties,
  groupPartyStats,
  MIN_LINEUP_GAMES,
} from "@/modules/groups/domain/group-stats";
import { topHeroes, weeklyBoard } from "@/modules/groups/domain/member-activity";
import type { PairClassification } from "@/modules/together/domain/pair";
import type { Relation, Seat } from "@/modules/together/domain/relation";

const member = (userId: string, accountId32: number, day: number): GroupMember => ({
  userId,
  accountId32,
  joinedAt: new Date(Date.UTC(2026, 9, day)),
});

describe("group rules", () => {
  it("normalises names", () => {
    expect(normaliseGroupName("  Friday   stack \n")).toBe("Friday stack");
  });

  it("refuses joins when already in, full, or at the per-player cap", () => {
    const members = [member("a", 1, 1)];
    expect(joinRefusal({ members }, "a", 1)).toBe("already_member");
    expect(joinRefusal({ members }, "b", 0)).toBeNull();
    expect(joinRefusal({ members }, "b", MAX_GROUPS_PER_USER)).toBe("too_many_groups");
    const full = Array.from({ length: MAX_GROUP_MEMBERS }, (_, i) => member(`u${i}`, i + 1, 1));
    expect(joinRefusal({ members: full }, "b", 0)).toBe("group_full");
  });

  it("hands ownership to the longest-standing other member, or nobody", () => {
    const members = [member("owner", 1, 1), member("late", 2, 9), member("early", 3, 3)];
    expect(nextOwner({ members }, "owner")?.userId).toBe("early");
    expect(nextOwner({ members: [member("owner", 1, 1)] }, "owner")).toBeNull();
  });

  it("lists each member pair once and keys them in order", () => {
    expect(memberPairs([3, 1, 2, 1])).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    expect(pairKey([5, 2])).toBe("2:5");
  });

  it("refreshes never-checked pairs first, then the stalest, skipping fresh ones", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const old = new Date(now.getTime() - PAIR_REFRESH_MS - 1);
    const older = new Date(now.getTime() - 2 * PAIR_REFRESH_MS);
    const fresh = new Date(now.getTime() - 1000);
    const pairs: Array<[number, number]> = [
      [1, 2],
      [1, 3],
      [2, 3],
      [3, 4],
    ];
    const at = { "1:2": old, "1:3": fresh, "2:3": older };
    expect(pairsToRefresh(pairs, at, now, 3)).toEqual([
      [3, 4],
      [2, 3],
      [1, 2],
    ]);
    expect(pairsToRefresh(pairs, at, now, 1)).toEqual([[3, 4]]);
  });
});

const T0 = Date.UTC(2026, 9, 1);
const seat = (
  side: "radiant" | "dire",
  partyId: number | null,
  partySize: number | null,
): Seat => ({
  side,
  heroId: 1,
  partyId,
  partySize,
});

function row(
  matchId: string,
  a: number,
  b: number,
  relation: Relation,
  opts: { radiantWin?: boolean | null; side?: "radiant" | "dire"; hour?: number } = {},
): PairClassification {
  const side = opts.side ?? "radiant";
  const s = relation === "party" ? seat(side, 9, 2) : seat(side, null, null);
  return {
    matchId,
    accountIdA: Math.min(a, b),
    accountIdB: Math.max(a, b),
    relation,
    startedAt: new Date(T0 + (opts.hour ?? Number(matchId)) * 3_600_000),
    radiantWin: opts.radiantWin === undefined ? true : opts.radiantWin,
    seatA: s,
    seatB: s,
    fetchedAt: new Date(T0),
  };
}

describe("group party stats", () => {
  it("joins pairs confirmed in one match into one party (a trio from three pairs)", () => {
    const { parties } = groupParties(
      [row("1", 1, 2, "party"), row("1", 2, 3, "party"), row("1", 1, 3, "party")],
      [1, 2, 3],
    );
    expect(parties).toEqual([
      expect.objectContaining({ matchId: "1", members: [1, 2, 3], result: "win" }),
    ]);
  });

  it("keeps two separate parties in one match apart, and ignores non-members", () => {
    const { parties } = groupParties(
      [
        row("1", 1, 2, "party"),
        row("1", 3, 4, "party", { side: "dire" }),
        row("2", 1, 99, "party"),
      ],
      [1, 2, 3, 4],
    );
    expect(parties.map((p) => [p.members, p.result])).toEqual(
      expect.arrayContaining([
        [[1, 2], "win"],
        [[3, 4], "loss"],
      ]),
    );
    expect(parties).toHaveLength(2);
  });

  it("counts unknown party data as unknown, never as together or solo", () => {
    const stats = groupPartyStats(
      [
        row("1", 1, 2, "same_team_unknown"),
        // Confirmed for 1–2 in match 2; 2–3 unknown there: still unknown for 3.
        row("2", 1, 2, "party"),
        row("2", 2, 3, "same_team_unknown"),
        // Unknown 1–3 in match 3, but both confirmed via 2: not unknown.
        row("3", 1, 2, "party"),
        row("3", 2, 3, "party"),
        row("3", 1, 3, "same_team_unknown"),
      ],
      [1, 2, 3],
    );
    expect(stats.record.games).toBe(2);
    expect(stats.unknownGames).toBe(2);
    expect(stats.members.find((m) => m.accountId32 === 3)?.games).toBe(1);
  });

  it("ranks lineups with enough games, pulling small samples toward 50%", () => {
    const rows: PairClassification[] = [];
    // Duo 1–2: 3 wins of 3. Trio 1–2–3: 8 wins of 10.
    for (let i = 0; i < 3; i++) rows.push(row(`${i + 10}`, 1, 2, "party"));
    for (let i = 0; i < 10; i++) {
      const id = `${i + 100}`;
      const win = i < 8;
      rows.push(
        row(id, 1, 2, "party", { radiantWin: win }),
        row(id, 2, 3, "party", { radiantWin: win }),
      );
    }
    // Duo 2–3: one game only.
    rows.push(row("500", 2, 3, "party"));
    // A party whose result is unknown counts as a game but not in lineups.
    rows.push(row("600", 1, 3, "party", { radiantWin: null }));
    const stats = groupPartyStats(rows, [1, 2, 3]);
    expect(stats.lineups.map((l) => [l.members, l.games, l.wins])).toEqual([
      [[1, 2, 3], 10, 8],
      [[1, 2], 3, 3],
    ]);
    expect(stats.lineups.every((l) => l.games >= MIN_LINEUP_GAMES)).toBe(true);
    expect(stats.smallLineups).toBe(1);
    expect(stats.record).toEqual({ games: 15, decided: 14, wins: 12 });
    expect(stats.lastPlayedAt).toEqual(rows.at(-1)!.startedAt);
  });
});

describe("member activity", () => {
  it("lists the most played heroes", () => {
    expect(
      topHeroes([
        { heroId: 5, result: "win" },
        { heroId: 7, result: "loss" },
        { heroId: 7, result: "win" },
        { heroId: 9, result: "win" },
        { heroId: 3, result: "loss" },
      ]),
    ).toEqual([
      { heroId: 7, games: 2, wins: 1 },
      { heroId: 5, games: 1, wins: 1 },
      { heroId: 9, games: 1, wins: 1 },
    ]);
  });

  it("ranks the week by net wins, shares ties and lists idle members apart", () => {
    const { rows, idle } = weeklyBoard([
      { accountId32: 1, wins: 3, losses: 1 },
      { accountId32: 2, wins: 5, losses: 3 },
      { accountId32: 3, wins: 0, losses: 0 },
      { accountId32: 4, wins: 2, losses: 0 },
    ]);
    expect(rows.map((r) => [r.accountId32, r.rank])).toEqual([
      [4, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(idle).toEqual([3]);
    const tie = weeklyBoard([
      { accountId32: 1, wins: 1, losses: 0 },
      { accountId32: 2, wins: 1, losses: 0 },
    ]);
    expect(tie.rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});
