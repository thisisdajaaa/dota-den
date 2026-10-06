import { describe, expect, it } from "vitest";
import { partyGroups, type MatchPlayer } from "@/modules/matches/domain/match-detail";

function player(playerSlot: number, partyId: number | null, partySize: number | null): MatchPlayer {
  return {
    playerSlot,
    side: playerSlot < 128 ? "radiant" : "dire",
    accountId32: null,
    personaName: null,
    heroId: 1,
    level: 1,
    kills: 0,
    deaths: 0,
    assists: 0,
    lastHits: 0,
    denies: 0,
    goldPerMin: 0,
    xpPerMin: 0,
    netWorth: null,
    heroDamage: null,
    towerDamage: null,
    heroHealing: null,
    items: [],
    backpack: [],
    neutralItem: null,
    hasScepter: false,
    hasShard: false,
    partyId,
    partySize,
    rankTier: null,
    benchmarks: null,
    laning: null,
  map: null,
  };
}

describe("partyGroups", () => {
  it("groups same-team players sharing a party id with party_size > 1", () => {
    const groups = partyGroups([
      player(0, 7, 2),
      player(3, 7, 2),
      player(1, 9, 3),
      player(2, 9, 3),
      player(4, 9, 3),
    ]);
    expect(groups).toEqual([
      { partyId: 7, side: "radiant", label: 1, playerSlots: [0, 3] },
      { partyId: 9, side: "radiant", label: 2, playerSlots: [1, 2, 4] },
    ]);
  });

  it("never groups solo players, even if their party ids collide", () => {
    expect(partyGroups([player(0, 0, 1), player(1, 0, 1)])).toEqual([]);
  });

  it("does not infer parties across teams or from missing data", () => {
    expect(partyGroups([player(0, 5, 2), player(128, 5, 2)])).toEqual([]);
    expect(partyGroups([player(0, null, null), player(1, null, null)])).toEqual([]);
  });
});
