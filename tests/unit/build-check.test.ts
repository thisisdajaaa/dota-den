import { describe, expect, it } from "vitest";
import {
  buildCheck,
  MIN_ROLE_GAMES,
  type HighRankPosition,
} from "@/modules/heroes/domain/build-check";
import type { CoachingGame } from "@/modules/heroes/domain/hero-coaching";

const KEYS: Record<number, string> = { 1: "bfury", 2: "manta", 3: "tango", 4: "abyssal" };
const keyOf = (id: number) => KEYS[id];
const isItem = (key: string) => key !== "tango";

function game(laneRole: number | null, timings: Record<string, number>): CoachingGame {
  return {
    result: "win",
    laneRole,
    roaming: false,
    efficiencyPct: null,
    laneResult: null,
    itemTimings: Object.entries(timings).map(([key, time]) => ({ key, time })),
  };
}

const carry: HighRankPosition = {
  position: 1,
  games: 5_000,
  items: [
    { itemId: 1, games: 4_800, minute: 13 },
    { itemId: 2, games: 3_000, minute: 21 },
    { itemId: 3, games: 4_900, minute: 2 },
    // Bought in under 1 in 10 games: too rare to compare.
    { itemId: 4, games: 300, minute: 30 },
  ],
};
const support: HighRankPosition = {
  position: 5,
  games: 800,
  items: [{ itemId: 1, games: 10, minute: 40 }],
};

describe("buildCheck", () => {
  it("compares your safe-lane timings with the hero's main safe-lane position", () => {
    const games = [
      ...Array.from({ length: 6 }, (_, i) =>
        game(1, { bfury: 15 * 60 + i * 10, manta: 22 * 60, tango: 0, abyssal: 31 * 60 }),
      ),
      // Another role doesn't count toward the safe-lane timings.
      game(2, { bfury: 30 * 60 }),
    ];
    const check = buildCheck(games, [support, carry], keyOf, isItem);
    expect(check).toMatchObject({ status: "ok", position: 1, yourGames: 6, theirGames: 5_000 });
    if (check.status !== "ok") throw new Error("expected ok");
    expect(check.rows.map((r) => r.key)).toEqual(["bfury", "manta"]);
    const bfury = check.rows[0];
    expect(bfury).toEqual({
      key: "bfury",
      yours: { median: 15 * 60 + 25, games: 6 },
      theirs: { median: 13 * 60, games: 4_800 },
      gap: 2 * 60 + 25,
    });
    expect(check.suggestion?.key).toBe("bfury");
  });

  it("says you're on pace when no gap reaches two minutes", () => {
    const games = Array.from({ length: MIN_ROLE_GAMES }, () => game(1, { bfury: 13 * 60 + 30 }));
    const check = buildCheck(games, [carry], keyOf, isItem);
    expect(check).toMatchObject({ status: "ok", suggestion: null });
  });

  it("needs enough games in the role, a role, and enough high-rank games", () => {
    const few = Array.from({ length: MIN_ROLE_GAMES - 1 }, () => game(1, { bfury: 800 }));
    expect(buildCheck(few, [carry], keyOf, isItem)).toEqual({
      status: "not_enough",
      yourGames: MIN_ROLE_GAMES - 1,
      minGames: MIN_ROLE_GAMES,
    });
    const jungle = Array.from({ length: 8 }, () => game(4, { bfury: 800 }));
    expect(buildCheck(jungle, [carry], keyOf, isItem)).toEqual({ status: "no_role" });
    const unknown = Array.from({ length: 8 }, () => game(null, { bfury: 800 }));
    expect(buildCheck(unknown, [carry], keyOf, isItem)).toEqual({ status: "no_role" });
    const mid = Array.from({ length: 8 }, () => game(2, { bfury: 800 }));
    expect(buildCheck(mid, [carry], keyOf, isItem)).toEqual({ status: "no_role" });
  });

  it("leaves out items you bought in fewer than three games", () => {
    const games = [
      ...Array.from({ length: 5 }, () => game(1, { bfury: 800 })),
      game(1, { bfury: 800, manta: 1200 }),
      game(1, { bfury: 800, manta: 1200 }),
    ];
    const check = buildCheck(games, [carry], keyOf, isItem);
    if (check.status !== "ok") throw new Error("expected ok");
    expect(check.rows.map((r) => r.key)).toEqual(["bfury"]);
  });
});
