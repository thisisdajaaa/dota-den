import { describe, expect, it } from "vitest";
import { inWindow, mapPoint, teamfightDeaths, wardSpots } from "@/modules/matches/domain/match-map";

describe("match map", () => {
  // Lane positions from a public parsed pro match (9030943450, OpenDota `lane_pos`).
  it("puts known lane positions in the right corners", () => {
    // Radiant offlaner (top lane): left edge, near the top.
    const top = mapPoint(66, 170);
    expect(top.left).toBeLessThan(0.1);
    expect(top.top).toBeLessThan(0.25);
    // Radiant carry early (safe lane, bottom): bottom left.
    const safe = mapPoint(73, 78);
    expect(safe.left).toBeLessThan(0.1);
    expect(safe.top).toBeGreaterThan(0.85);
    // Dire safe lane (top): top left, at the top edge.
    expect(mapPoint(79, 187).top).toBeLessThan(0.05);
    // Mid: the centre.
    expect(mapPoint(128, 128)).toEqual({ left: 0.5, top: 0.5 });
    // Off-map values are clamped.
    expect(mapPoint(0, 300)).toEqual({ left: 0, top: 0 });
  });

  it("pairs wards with their removal by entity handle and skips ones without a position", () => {
    expect(
      wardSpots(
        "observer",
        [
          { time: 10, x: 100, y: 100, ehandle: 1 },
          { time: 20, x: 110, y: 110, ehandle: 2 },
          { time: 30 },
        ],
        [{ time: 200, ehandle: 1 }],
      ),
    ).toEqual([
      { kind: "observer", placedAt: 10, removedAt: 200, x: 100, y: 100 },
      { kind: "observer", placedAt: 20, removedAt: null, x: 110, y: 110 },
    ]);
    expect(wardSpots("sentry", null, null)).toEqual([]);
  });

  it("expands team fight death counts and filters by time window", () => {
    expect(teamfightDeaths([{ start: 700, deathsPos: { "120": { "130": 2 } } }])).toEqual([
      { time: 700, x: 120, y: 130 },
      { time: 700, x: 120, y: 130 },
    ]);
    expect(inWindow(-30, "laning")).toBe(true);
    expect(inWindow(600, "laning")).toBe(false);
    expect(inWindow(600, "mid")).toBe(true);
    expect(inWindow(1800, "late")).toBe(true);
    expect(inWindow(99_999, "all")).toBe(true);
  });
});
