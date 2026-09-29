import { describe, expect, it } from "vitest";
import { partyGroups, type MatchPlayer } from "@/modules/matches/domain/match-detail";
import { otherOf, pairOf, resultFor, type PairClassification } from "@/modules/together/domain/pair";
import { classifyRelation, type Seat } from "@/modules/together/domain/relation";

const seat = (over: Partial<Seat> = {}): Seat => ({
  side: "radiant",
  heroId: 1,
  partyId: 7,
  partySize: 2,
  ...over,
});

describe("classifyRelation", () => {
  it("is a party only with the same side, same party id and party size ≥ 2", () => {
    expect(classifyRelation(seat(), seat({ heroId: 2 }))).toBe("party");
    expect(classifyRelation(seat({ partySize: 5 }), seat({ partySize: 5 }))).toBe("party");
  });

  it("opponents when on different sides, whatever the party ids", () => {
    expect(classifyRelation(seat(), seat({ side: "dire" }))).toBe("opponents");
    expect(classifyRelation(seat({ partyId: null }), seat({ side: "dire" }))).toBe("opponents");
  });

  it("missing party data on the same team is unknown, never a party", () => {
    expect(classifyRelation(seat({ partyId: null }), seat())).toBe("same_team_unknown");
    expect(classifyRelation(seat(), seat({ partySize: null }))).toBe("same_team_unknown");
    expect(
      classifyRelation(
        seat({ partyId: null, partySize: null }),
        seat({ partyId: null, partySize: null }),
      ),
    ).toBe("same_team_unknown");
    // Both ids null is not "equal ids".
    expect(
      classifyRelation(seat({ partyId: null }), seat({ partyId: null }))).not.toBe("party");
  });

  it("different party ids, or a party size of 1, means queued separately", () => {
    expect(classifyRelation(seat({ partyId: 1 }), seat({ partyId: 2 }))).toBe(
      "same_team_separate",
    );
    // Same id but a reported size of 1: queued alone (matches partyGroups).
    expect(classifyRelation(seat({ partySize: 1 }), seat({ partySize: 1 }))).toBe(
      "same_team_separate",
    );
    expect(classifyRelation(seat({ partySize: 1 }), seat({ partyId: null }))).toBe(
      "same_team_separate",
    );
  });

  it("undetermined when either seat is missing", () => {
    expect(classifyRelation(null, seat())).toBe("undetermined");
    expect(classifyRelation(seat(), null)).toBe("undetermined");
  });

  it("agrees with the match page's partyGroups", () => {
    const p = (slot: number, over: Partial<MatchPlayer>): MatchPlayer =>
      ({
        playerSlot: slot,
        side: slot < 128 ? "radiant" : "dire",
        accountId32: slot + 1,
        heroId: 1,
        partyId: null,
        partySize: null,
        ...over,
      }) as MatchPlayer;
    const cases: Array<[Partial<MatchPlayer>, Partial<MatchPlayer>]> = [
      [{ partyId: 3, partySize: 2 }, { partyId: 3, partySize: 2 }],
      [{ partyId: 3, partySize: 1 }, { partyId: 3, partySize: 1 }],
      [{ partyId: 3, partySize: 2 }, { partyId: 4, partySize: 2 }],
      [{ partyId: 3, partySize: null }, { partyId: 3, partySize: null }],
    ];
    for (const [a, b] of cases) {
      const players = [p(0, a), p(1, b)];
      const grouped = partyGroups(players).some((g) => g.playerSlots.length === 2);
      const toSeat = (m: MatchPlayer): Seat => ({
        side: m.side,
        heroId: m.heroId,
        partyId: m.partyId,
        partySize: m.partySize,
      });
      expect(classifyRelation(toSeat(players[0]), toSeat(players[1])) === "party").toBe(grouped);
    }
  });
});

describe("account pairs", () => {
  it("orders pairs so either direction has one key", () => {
    expect(pairOf(9, 3)).toEqual({ accountIdA: 3, accountIdB: 9 });
    expect(pairOf(3, 9)).toEqual(pairOf(9, 3));
    expect(otherOf(pairOf(3, 9), 3)).toBe(9);
    expect(otherOf(pairOf(3, 9), 9)).toBe(3);
    expect(() => pairOf(5, 5)).toThrow();
  });

  it("derives each player's result from their own seat", () => {
    const c: PairClassification = {
      ...pairOf(10, 20),
      matchId: "1",
      relation: "opponents",
      startedAt: new Date(0),
      radiantWin: true,
      seatA: seat({ side: "radiant" }),
      seatB: seat({ side: "dire" }),
      fetchedAt: new Date(0),
    };
    expect(resultFor(c, 10)).toBe("win");
    expect(resultFor(c, 20)).toBe("loss");
    expect(resultFor(c, 30)).toBeNull();
    expect(resultFor({ ...c, radiantWin: null }, 10)).toBeNull();
  });
});
