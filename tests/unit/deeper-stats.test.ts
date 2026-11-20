import { describe, expect, it } from "vitest";
import {
  dayPartOf,
  deeperStats,
  lengthBandOf,
  localHour,
  type SplitGame,
  type SplitLane,
} from "@/modules/heroes/domain/deeper-stats";

const game = (
  id: number,
  over: Partial<SplitGame> & { result?: "win" | "loss" } = {},
): SplitGame => ({
  matchId: String(id),
  heroId: 1,
  startedAt: new Date("2026-11-10T12:00:00Z"),
  durationSec: 30 * 60,
  result: "win",
  patch: "7.42",
  ...over,
});

const lane = (id: number, over: Partial<SplitLane> = {}): SplitLane => ({
  matchId: String(id),
  heroId: 1,
  laneRole: 1,
  roaming: false,
  laneResult: "won",
  lanePartnerHeroIds: [5],
  ...over,
});

// Hero 1 is a carry, hero 2 a support.
const rolesOf = (id: number) => (id === 2 ? ["Support"] : id === 1 ? ["Carry"] : undefined);

describe("deeper stats helpers", () => {
  it("reads the local hour in the viewer's time zone, UTC for an unknown one", () => {
    const d = new Date("2026-11-10T15:30:00Z");
    expect(localHour(d, "Asia/Manila")).toBe(23);
    expect(localHour(d, "Not/AZone")).toBe(15);
    expect(localHour(new Date("2026-11-10T16:00:00Z"), "Asia/Manila")).toBe(0);
  });

  it("puts hours and lengths in their bands", () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(dayPartOf)).toEqual([
      "night",
      "night",
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
    ]);
    expect([10, 24.9, 25, 34.9, 35, 45, 60].map((m) => lengthBandOf(m * 60))).toEqual([
      "short",
      "short",
      "normal",
      "normal",
      "long",
      "very_long",
      "very_long",
    ]);
  });
});

describe("deeperStats", () => {
  it("splits by patch (newest first), counts unknown patches apart and folds older ones", () => {
    const games = [
      ...["7.36", "7.37", "7.38", "7.39", "7.40", "7.41", "7.42"].map((patch, i) =>
        game(i, { patch, startedAt: new Date(Date.UTC(2026, i, 1)) }),
      ),
      game(10, { patch: null }),
      game(11, { patch: "7.42", result: "loss", startedAt: new Date(Date.UTC(2026, 6, 2)) }),
    ];
    const s = deeperStats(games, [], { timeZone: "UTC", rolesOf });
    expect(s.patches.rows.map((r) => [r.key, r.games, r.wins])).toEqual([
      ["7.42", 2, 1],
      ["7.41", 1, 1],
      ["7.40", 1, 1],
      ["7.39", 1, 1],
      ["7.38", 1, 1],
      ["7.37", 1, 1],
    ]);
    expect(s.patches.older).toBe(1);
    expect(s.patches.unassigned).toBe(1);
    expect(s.overall).toMatchObject({ games: 9, wins: 8 });
    // Every row is a real count; a 1-game row is flagged, never hidden as a finding.
    expect(s.patches.rows[1]).toMatchObject({ winRate: 1, lowSample: true });
  });

  it("splits by time of day in the viewer's zone and by game length", () => {
    const games = [
      game(1, { startedAt: new Date("2026-11-10T13:00:00Z") }), // 21:00 Manila: evening
      game(2, { startedAt: new Date("2026-11-10T17:00:00Z"), result: "loss" }), // 01:00: night
      game(3, { startedAt: new Date("2026-11-10T01:00:00Z"), durationSec: 50 * 60 }), // 09:00
      game(4, { durationSec: 0 }), // length unknown: left out of the length split
    ];
    const s = deeperStats(games, [], { timeZone: "Asia/Manila", rolesOf });
    expect(s.dayParts.map((r) => [r.key, r.games])).toEqual([
      ["morning", 1],
      ["afternoon", 0],
      ["evening", 2],
      ["night", 1],
    ]);
    expect(s.dayParts[1].winRate).toBeNull();
    expect(s.lengths.map((r) => [r.key, r.games])).toEqual([
      ["short", 0],
      ["normal", 2],
      ["long", 0],
      ["very_long", 1],
    ]);
  });

  it("reads positions, lane results and lane partners only from parsed games it can place", () => {
    const games = [1, 2, 3, 4, 5, 6].map((i) =>
      game(i, { heroId: i <= 3 ? 1 : 2, result: i % 2 ? "win" : "loss" }),
    );
    const lanes = [
      lane(1, { lanePartnerHeroIds: [5, 5] }),
      lane(2, { laneResult: "lost" }),
      lane(3, { laneRole: 2, lanePartnerHeroIds: [] }),
      lane(4, { heroId: 2, laneRole: 3, laneResult: null, lanePartnerHeroIds: [7] }),
      // A core in the jungle can't be placed; stored before partners were kept.
      lane(5, { heroId: 1, laneRole: 4, laneResult: null, lanePartnerHeroIds: undefined }),
      // Roaming: not a lane partner.
      lane(6, { heroId: 2, roaming: true, laneRole: 3, laneResult: null, lanePartnerHeroIds: [] }),
      // A lane for a game we don't have is ignored.
      lane(99),
    ];
    const s = deeperStats(games, lanes, { timeZone: "UTC", rolesOf });
    expect(s.positions.parsed).toBe(6);
    expect(s.positions.unplaced).toBe(1);
    expect(s.positions.rows.map((r) => [r.key, r.games, r.wins])).toEqual([
      [1, 2, 1],
      [2, 1, 1],
      [3, 0, 0],
      [4, 2, 0],
      [5, 0, 0],
    ]);
    expect(s.laneOutcomes.read).toBe(3);
    expect(s.laneOutcomes.rows.map((r) => [r.key, r.games, r.wins])).toEqual([
      ["won", 2, 2],
      ["even", 0, 0],
      ["lost", 1, 0],
    ]);
    // Hero 5 laned with you in 2 games (a duplicate id in one game counts once), hero 7 once:
    // both under the 3-game bar, so counted, not listed.
    expect(s.partners).toMatchObject({ rows: [], read: 4, belowMin: 2, minGames: 3 });
  });

  it("lists lane partners with enough games, most games first", () => {
    const games = Array.from({ length: 7 }, (_, i) => game(i, { result: i < 4 ? "win" : "loss" }));
    const lanes = games.map((g, i) =>
      lane(Number(g.matchId), { lanePartnerHeroIds: i < 4 ? [5] : [8] }),
    );
    const s = deeperStats(games, lanes, { timeZone: "UTC", rolesOf });
    expect(s.partners.rows.map((r) => [r.heroId, r.games, r.wins])).toEqual([
      [5, 4, 4],
      [8, 3, 0],
    ]);
  });
});
