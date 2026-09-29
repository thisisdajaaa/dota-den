import { describe, expect, it } from "vitest";
import type { Relation } from "@/modules/together/domain/relation";
import {
  baselineRecord,
  compareWithBaseline,
  FORM_LENGTH,
  heroPairs,
  MIN_BASELINE_GAMES,
  MIN_TOGETHER_GAMES,
  summarisePair,
  topTrios,
  type SharedGame,
} from "@/modules/together/domain/together-stats";
import { comparisonCopy, formatDelta } from "@/modules/together/ui/copy";

const DAY = 86_400_000;
const T0 = Date.parse("2026-09-01T00:00:00Z");

let seq = 0;
function game(over: Partial<SharedGame> & { day?: number } = {}): SharedGame {
  const { day = seq, ...rest } = over;
  seq++;
  return {
    matchId: String(1000 + seq),
    startedAt: new Date(T0 + day * DAY),
    relation: "party",
    result: "win",
    myHeroId: 1,
    friendHeroId: 2,
    ...rest,
  };
}

describe("summarisePair", () => {
  it("counts only confirmed party games toward together stats", () => {
    const relations: Relation[] = [
      "party",
      "party",
      "party",
      "same_team_unknown",
      "same_team_separate",
      "opponents",
      "undetermined",
    ];
    const games = relations.map((relation, i) =>
      game({ relation, day: i, result: i === 0 ? "loss" : "win" }),
    );
    const s = summarisePair(games);
    expect(s.together).toEqual({ games: 3, wins: 2 });
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.byRelation).toEqual({
      party: 3,
      same_team_unknown: 1,
      same_team_separate: 1,
      opponents: 1,
      undetermined: 1,
    });
    // Newest party game is day 2; first is day 0.
    expect(s.lastPlayedAt).toEqual(new Date(T0 + 2 * DAY));
    expect(s.firstPlayedAt).toEqual(new Date(T0));
  });

  it("has no win rate (not 0%) and no dates without party games", () => {
    const s = summarisePair([game({ relation: "opponents" })]);
    expect(s.together).toEqual({ games: 0, wins: 0 });
    expect(s.winRate).toBeNull();
    expect(s.lastPlayedAt).toBeNull();
    expect(s.form).toEqual([]);
  });

  it("keeps the last games together, newest first", () => {
    const games = Array.from({ length: 14 }, (_, i) =>
      game({ day: i, result: i % 2 ? "win" : "loss" }),
    );
    const s = summarisePair(games);
    expect(s.form).toHaveLength(FORM_LENGTH);
    expect(s.form[0].matchId).toBe(games[13].matchId);
  });
});

describe("heroPairs", () => {
  it("aggregates your hero + their hero in party games, min 3 games, most played first", () => {
    const games = [
      ...Array.from({ length: 4 }, (_, i) =>
        game({ myHeroId: 1, friendHeroId: 2, result: i < 3 ? "win" : "loss" }),
      ),
      ...Array.from({ length: 3 }, () => game({ myHeroId: 5, friendHeroId: 6, result: "loss" })),
      // Too few games.
      game({ myHeroId: 7, friendHeroId: 8 }),
      game({ myHeroId: 7, friendHeroId: 8 }),
      // Not a party game, or unknown friend hero: ignored.
      ...Array.from({ length: 3 }, () =>
        game({ myHeroId: 9, friendHeroId: 9, relation: "same_team_unknown" }),
      ),
      ...Array.from({ length: 3 }, () => game({ myHeroId: 1, friendHeroId: null })),
    ];
    const pairs = heroPairs(games);
    expect(pairs.map((p) => [p.myHeroId, p.friendHeroId, p.games, p.wins])).toEqual([
      [1, 2, 4, 3],
      [5, 6, 3, 0],
    ]);
    expect(pairs[0].winRate).toBe(0.75);
    // Order matters: (1,2) and (2,1) are different pairings.
    expect(heroPairs([game({ myHeroId: 2, friendHeroId: 1 })], 1)[0]).toMatchObject({
      myHeroId: 2,
      friendHeroId: 1,
    });
  });
});

describe("baseline comparison", () => {
  const own = (n: number, wins: number, fromDay: number) =>
    Array.from({ length: n }, (_, i) => ({
      matchId: `own-${fromDay}-${i}`,
      startedAt: new Date(T0 + (fromDay + i) * DAY),
      result: (i < wins ? "win" : "loss") as "win" | "loss",
    }));

  it("uses own games from the first party game on, excluding the games together", () => {
    const before = own(5, 5, -10); // before the period: ignored
    const during = own(12, 6, 0);
    const together = new Set([during[0].matchId, during[1].matchId]);
    const record = baselineRecord(
      [...before, ...during],
      { firstPlayedAt: new Date(T0) },
      together,
    );
    // 12 - 2 excluded; the first two were wins.
    expect(record).toEqual({ games: 10, wins: 4 });
    expect(baselineRecord(during, { firstPlayedAt: null }, together)).toBeNull();
  });

  it("refuses to compare below the minimum sample", () => {
    expect(compareWithBaseline({ games: MIN_TOGETHER_GAMES - 1, wins: 9 }, { games: 100, wins: 50 }))
      .toEqual({ kind: "too_few_together", games: 9, needed: MIN_TOGETHER_GAMES });
    expect(compareWithBaseline({ games: 20, wins: 12 }, null)).toMatchObject({
      kind: "no_baseline",
      games: 0,
    });
    expect(
      compareWithBaseline({ games: 20, wins: 12 }, { games: MIN_BASELINE_GAMES - 1, wins: 5 }),
    ).toMatchObject({ kind: "no_baseline", games: 9 });
  });

  it("reports the difference in win rate once both samples are big enough", () => {
    const c = compareWithBaseline({ games: 50, wins: 29 }, { games: 500, wins: 259 });
    expect(c.kind).toBe("compared");
    if (c.kind !== "compared") return;
    expect(c.togetherRate).toBeCloseTo(0.58);
    expect(c.baselineRate).toBeCloseTo(0.518);
    expect(c.delta).toBeCloseTo(0.062);
    expect(comparisonCopy(c, { games: 500, wins: 259 }).value).toBe("+6.2% vs your usual");
  });

  it("formats deltas in plain language", () => {
    expect(formatDelta(0.062)).toBe("+6.2%");
    expect(formatDelta(-0.03)).toBe("−3.0%");
    expect(formatDelta(0.0001)).toBe("±0.0%");
    expect(
      comparisonCopy({ kind: "too_few_together", games: 4, needed: 10 }, null).value,
    ).toBe("Too few games together to judge");
  });
});

describe("topTrios", () => {
  it("counts matches where the player partied with two friends at once", () => {
    const links = [
      { matchId: "10", friendId: 2, result: "win" as const },
      { matchId: "10", friendId: 3, result: "win" as const },
      { matchId: "11", friendId: 3, result: "loss" as const },
      { matchId: "11", friendId: 2, result: "loss" as const },
      { matchId: "12", friendId: 2, result: "win" as const }, // duo only
      // A four-stack yields every trio in it.
      { matchId: "13", friendId: 2, result: "win" as const },
      { matchId: "13", friendId: 3, result: "win" as const },
      { matchId: "13", friendId: 4, result: "win" as const },
    ];
    const trios = topTrios(links);
    expect(trios[0]).toEqual({ friends: [2, 3], games: 3, wins: 2, lastMatchId: "13" });
    expect(trios.slice(1).map((t) => t.friends)).toEqual(
      expect.arrayContaining([
        [2, 4],
        [3, 4],
      ]),
    );
    expect(trios).toHaveLength(3);
    expect(topTrios([{ matchId: "1", friendId: 2, result: "win" }])).toEqual([]);
  });
});
