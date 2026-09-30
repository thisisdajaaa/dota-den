import { describe, expect, it } from "vitest";
import { heroCohort, MIN_COHORT_GAMES, patchDigest } from "@/modules/patches/domain/digest";

const released = new Date("2026-09-01T00:00:00Z");
const game = (heroId: number, daysFromRelease: number, win: boolean) => ({
  heroId,
  startedAt: new Date(released.getTime() + daysFromRelease * 86_400_000),
  result: (win ? "win" : "loss") as "win" | "loss",
});
const note = (text: string) => ({ text, indentLevel: 1, info: null, aghanims: null });
const patch = {
  version: "7.41",
  name: "7.41",
  publishedAt: released,
  sections: {
    heroes: [
      {
        heroId: 1,
        heroNotes: [note("Base armor increased by 1")],
        talentNotes: [note("Level 10 talent changed")],
        abilities: [
          {
            abilityId: 5,
            abilityKey: "x",
            abilityName: "Blink",
            iconPath: null,
            notes: [note("Cooldown reduced")],
          },
        ],
      },
      { heroId: 2, heroNotes: [note("Strength gain reduced")], talentNotes: [], abilities: [] },
      { heroId: 99, heroNotes: [note("Not yours")], talentNotes: [], abilities: [] },
    ],
  },
} as never;

describe("heroCohort", () => {
  it("splits your games on a hero at the release time", () => {
    const c = heroCohort(
      [game(1, -2, true), game(1, -1, false), game(1, 1, true), game(2, 1, true)],
      1,
      released,
    );
    expect(c).toEqual({ before: { games: 2, wins: 1 }, after: { games: 1, wins: 1 } });
  });
});

describe("patchDigest", () => {
  it("lists only your changed heroes, with highlights and a before/since comparison", () => {
    const results = [
      ...Array.from({ length: MIN_COHORT_GAMES }, (_, i) => game(1, -i - 1, i < 2)),
      ...Array.from({ length: MIN_COHORT_GAMES }, (_, i) => game(1, i + 1, i < 4)),
      game(2, -1, true),
    ];
    const d = patchDigest({ patch, poolHeroIds: [1, 2], results });
    expect(d.heroes.map((h) => h.heroId)).toEqual([1, 2]);
    const [one, two] = d.heroes;
    expect(one.highlights).toEqual(["Base armor increased by 1", "Blink: Cooldown reduced"]);
    expect(one.noteCount).toBe(3);
    expect(one.delta).toBeCloseTo(4 / 5 - 2 / 5);
    // One game before and none since: never a comparison.
    expect(two.delta).toBeNull();
  });

  it("is empty when the patch didn't touch your heroes", () => {
    expect(patchDigest({ patch, poolHeroIds: [3], results: [] }).heroes).toEqual([]);
  });
});
