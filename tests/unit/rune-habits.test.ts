import { describe, expect, it } from "vitest";
import { MIN_RUNE_GAMES, runeHabits, type HeroRune } from "@/modules/heroes/domain/rune-habits";

const r = (kind: HeroRune["kind"], time: number): HeroRune => ({ kind, time });

describe("runeHabits", () => {
  it("counts only games with a rune log", () => {
    const h = runeHabits([{ runes: [r("bounty", 0)] }, { runes: null }, {}]);
    expect(h.games).toBe(1);
    expect(h.perGame.bounty).toBe(1);
  });

  it("has nothing to say without rune logs", () => {
    const h = runeHabits([{ runes: null }]);
    expect(h).toEqual({
      games: 0,
      perGame: { bounty: null, power: null, wisdom: null, water: null },
      hornBountyShare: null,
      powerLaningPerGame: null,
      powerByKind: [],
    });
  });

  it("averages per game and splits power runes by kind", () => {
    const h = runeHabits([
      { runes: [r("bounty", 0), r("water", 120), r("haste", 360), r("wisdom", 423)] },
      { runes: [r("bounty", 180), r("double_damage", 720), r("haste", 1200)] },
      { runes: [] },
      { runes: [r("bounty", 12), r("arcane", 480)] },
    ]);
    expect(h.games).toBe(4);
    expect(h.perGame).toEqual({ bounty: 0.75, power: 1, wisdom: 0.25, water: 0.25 });
    // haste 360 and arcane 480 before 10:00.
    expect(h.powerLaningPerGame).toBe(0.5);
    expect(h.powerByKind).toEqual([
      { kind: "haste", n: 2 },
      { kind: "double_damage", n: 1 },
      { kind: "arcane", n: 1 },
    ]);
    // Too few games for a share.
    expect(h.hornBountyShare).toBeNull();
  });

  it("shows the horn bounty share from enough games", () => {
    const games = Array.from({ length: MIN_RUNE_GAMES }, (_, i) => ({
      runes: i < 2 ? [r("bounty", 5)] : [r("bounty", 180)],
    }));
    expect(runeHabits(games).hornBountyShare).toBeCloseTo(2 / MIN_RUNE_GAMES);
  });
});
