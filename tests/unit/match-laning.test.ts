import { describe, expect, it } from "vitest";
import {
  atMinute,
  clockTime,
  keyItemTimings,
  laneOpponents,
  type Laning,
} from "@/modules/matches/domain/match-laning";

const laning = (lane: number, roaming = false): Laning => ({
  lane,
  laneRole: 1,
  roaming,
  efficiencyPct: 70,
  lastHitsAt10: 40,
  deniesAt10: 5,
  goldAt10: 3_500,
  observers: 0,
  sentries: 0,
  campsStacked: 0,
  stunsSec: 0,
  teamfight: 0.5,
  purchases: [],
});

describe("match laning", () => {
  it("reads minute 10 from a series, if the game got there", () => {
    expect(atMinute([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 51])).toBe(51);
    expect(atMinute([0, 1, 2])).toBeNull();
    expect(atMinute(null)).toBeNull();
  });

  it("lists the first purchase of each key item, in order", () => {
    const res = keyItemTimings(
      [
        { time: 900, key: "bfury" },
        { time: -80, key: "tango" },
        { time: 400, key: "power_treads" },
        { time: 1500, key: "bfury" },
      ],
      (k) => k !== "tango",
    );
    expect(res).toEqual([
      { key: "power_treads", time: 400 },
      { key: "bfury", time: 900 },
    ]);
    expect(clockTime(-80)).toBe("-1:20");
    expect(clockTime(754)).toBe("12:34");
  });

  it("finds lane opponents on the other team, ignoring roamers and jungle", () => {
    const players = [
      { side: "radiant" as const, laning: laning(1) },
      { side: "dire" as const, laning: laning(1) },
      { side: "dire" as const, laning: laning(1, true) },
      { side: "dire" as const, laning: laning(2) },
    ];
    expect(laneOpponents(players, players[0])).toEqual([players[1]]);
    expect(laneOpponents(players, { side: "radiant", laning: laning(4) })).toEqual([]);
  });
});
