import { describe, expect, it } from "vitest";
import {
  buildPath,
  startingBuild,
  STARTING_GOLD,
  type PubBuild,
} from "@/modules/guides/domain/hero-guide";
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
      item(50, 120, 25), // late game: after minute 25, below the core share
      item(60, 80, 41), // late game, bought later
      item(61, 100, 18), // situational: below the core share before minute 25
      item(62, 50, 30), // situational: too few games for the late game
      item(46, 30, 30), // too rare
      item(200, 500, 15), // excluded (consumable)
    ],
  };
  const path = buildPath(build, (id) => id === 200);

  it("lays the core out in buying order with its timings", () => {
    expect(path.core.map((p) => p.itemId)).toEqual([100, 1, 116]);
    expect(path.core[0]).toMatchObject({ minute: 20, fastMinute: 18, share: 0.6, winRate: 0.5 });
  });

  it("keeps starting, early, late and situational items apart", () => {
    expect(path.start.map((p) => p.itemId)).toEqual([44, 16]);
    expect(path.early.map((p) => p.itemId)).toEqual([36]);
    expect(path.late.map((p) => p.itemId)).toEqual([50, 60]);
    expect(path.late[1]).toMatchObject({ minute: 41, share: 0.08 });
    expect(path.situational.map((p) => p.itemId)).toEqual([61, 62]);
  });

  it("fills a full inventory in long games: up to six late items after the core", () => {
    const many: PubBuild = {
      ...build,
      items: [
        item(1, 700, 15),
        item(100, 600, 20),
        ...Array.from({ length: 8 }, (_, i) => item(300 + i, 200 - i * 10, 26 + i * 2)),
      ],
    };
    const res = buildPath(many, () => false);
    expect(res.core.map((p) => p.itemId)).toEqual([1, 100]);
    expect(res.late.map((p) => p.itemId)).toEqual([300, 301, 302, 303, 304, 305]);
    expect(res.situational.map((p) => p.itemId)).toEqual([306, 307]);
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

describe("startingBuild", () => {
  const COST: Record<number, number> = {
    44: 90,
    16: 50,
    29: 500,
    42: 50,
    46: 50,
    244: 250,
    12: 50,
  };
  const costOf = (id: number) => COST[id] ?? null;
  const start = (itemId: number, games: number, copies = 1) => ({
    itemId,
    games,
    wins: games / 2,
    minute: null,
    copies,
  });

  it("is one start a player can afford: popular items, with copies, within 600 gold", () => {
    // Blood Grenade, Tango ×2, Boots, Sentry, Branch ×2, Wind Lace: 1,030 gold if all bought.
    const rows = [
      start(12, 900), // Blood Grenade 50
      start(44, 880, 2), // Tango ×2 180
      start(29, 600), // Boots of Speed 500: doesn't fit after the above
      start(42, 500), // Sentry 50
      start(16, 450, 2), // Iron Branch ×2 100
      start(244, 300), // Wind Lace 250: doesn't fit
      start(46, 5), // too rare
    ];
    const { start: picks, alternatives } = startingBuild(rows, 1_000, costOf);
    expect(picks.map((p) => [p.itemId, p.copies])).toEqual([
      [12, 1],
      [44, 2],
      [42, 1],
      [16, 2],
    ]);
    const gold = picks.reduce((n, p) => n + COST[p.itemId] * (p.copies ?? 1), 0);
    expect(gold).toBe(380);
    expect(gold).toBeLessThanOrEqual(STARTING_GOLD);
    expect(alternatives.map((p) => p.itemId)).toEqual([29, 244]);
  });

  it("takes fewer copies when all of them don't fit", () => {
    const { start: picks } = startingBuild([start(29, 900), start(44, 800, 3)], 1_000, costOf);
    expect(picks.map((p) => [p.itemId, p.copies])).toEqual([
      [29, 1],
      [44, 1],
    ]);
  });

  it("without prices, lists the most bought starting items", () => {
    const { start: picks, alternatives } = startingBuild([start(44, 800), start(29, 900)], 1_000);
    expect(picks.map((p) => p.itemId)).toEqual([29, 44]);
    expect(alternatives).toEqual([]);
  });
});
