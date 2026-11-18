import { describe, expect, it } from "vitest";
import { buildPath, type PubBuild } from "@/modules/guides/domain/hero-guide";
import {
  skillBuild,
  talentName,
  type AbilityRef,
  type TalentRef,
} from "@/modules/guides/domain/skill-build";
import { mapPosition, topWardSpots, type WardCell } from "@/modules/guides/domain/ward-spots";

const item = (itemId: number, games: number, minute: number | null, wins = games / 2) => ({
  itemId,
  games,
  wins,
  minute,
  fastMinute: minute === null ? null : minute - 2,
});

describe("buildPath", () => {
  const build: PubBuild = {
    position: 5,
    games: 1_000,
    wins: 500,
    starting: [item(44, 900, null), item(16, 800, null), item(99, 5, null)],
    items: [
      item(36, 880, 5), // early: magic wand
      item(77, 100, 4), // early but rare: left out
      item(1, 700, 22), // core
      item(100, 600, 20), // core, bought earlier
      item(116, 300, 34), // core
      item(50, 120, 25), // situational
      item(46, 30, 30), // too rare
      item(200, 500, 15), // excluded (consumable)
    ],
  };
  const path = buildPath(build, (id) => id === 200);

  it("lays the core out in buying order with its timings", () => {
    expect(path.core.map((p) => p.itemId)).toEqual([100, 1, 116]);
    expect(path.core[0]).toMatchObject({ minute: 20, fastMinute: 18, share: 0.6, winRate: 0.5 });
  });

  it("keeps starting, early and situational items apart", () => {
    expect(path.start.map((p) => p.itemId)).toEqual([44, 16]);
    expect(path.early.map((p) => p.itemId)).toEqual([36]);
    expect(path.situational.map((p) => p.itemId)).toEqual([50]);
  });
});

describe("skillBuild", () => {
  const abilities: AbilityRef[] = [
    { id: 1, name: "Q", imageUrl: null },
    { id: 2, name: "W", imageUrl: null },
    { id: 3, name: "E", imageUrl: null },
    { id: 4, name: "R", imageUrl: null },
  ];
  const talents: TalentRef[] = [
    { id: 10, name: "+{s:value} Damage", tier: 1 },
    { id: 11, name: "+{s:value}% Slow", tier: 1 },
  ];
  const base = [1, 2, 1, 2, 1, 4, 1, 2, 2, 10, 3, 4];

  it("takes the most common skill per level and never exceeds a real cap", () => {
    const games = [
      ...Array.from({ length: 6 }, () => base),
      // Two games max E instead, one takes the other talent.
      [1, 3, 1, 3, 1, 4, 1, 3, 3, 11, 2, 4],
      [1, 3, 1, 3, 1, 4, 1, 3, 3, 10, 2, 4],
    ];
    const res = skillBuild(games, { abilities, talents })!;
    expect(res.games).toBe(8);
    expect(res.order).toEqual(base);
    expect(res.order.filter((id) => id === 4)).toHaveLength(2);
    expect(res.abilities.map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(res.talents).toEqual([
      {
        level: 10,
        options: [
          { id: 10, name: "+{s:value} Damage", picks: 7, share: 7 / 8 },
          { id: 11, name: "+{s:value}% Slow", picks: 1, share: 1 / 8 },
        ],
      },
    ]);
  });

  it("needs enough games", () => {
    expect(skillBuild([base, base], { abilities, talents })).toBeNull();
  });

  it("drops the numbers the game fills in at runtime from talent names", () => {
    expect(talentName("+{s:bonus_damage} Damage")).toBe("+ Damage");
    expect(talentName("-{s:bonus_AbilityCooldown}s Crystal Nova Cooldown")).toBe(
      "- Crystal Nova Cooldown",
    );
    expect(talentName("+200 Health")).toBe("+200 Health");
  });
});

describe("ward spots", () => {
  it("maps OpenDota coordinates onto the map image (y grows upward)", () => {
    expect(mapPosition(128, 128)).toEqual({ left: 0.5, top: 0.5 });
    expect(mapPosition(64, 64)).toEqual({ left: 0, top: 1 });
    expect(mapPosition(300, 0)).toEqual({ left: 1, top: 1 });
  });

  it("ranks one side and phase's spots, most used first", () => {
    const cell = (x: number, count: number, side: WardCell["side"] = "radiant"): WardCell => ({
      kind: "observer",
      side,
      phase: "early",
      x,
      y: 128,
      count,
    });
    const spots = topWardSpots([cell(100, 5), cell(120, 20), cell(140, 50, "dire")], {
      kind: "observer",
      side: "radiant",
      phase: "early",
    });
    expect(spots.map((s) => [s.count, s.relative])).toEqual([
      [20, 1],
      [5, 0.25],
    ]);
  });
});
