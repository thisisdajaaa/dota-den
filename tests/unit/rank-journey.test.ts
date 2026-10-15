import { describe, expect, it } from "vitest";
import type { HeroRankedResult } from "@/modules/mmr/domain/hero-climb";
import { MmrInsightsService } from "@/modules/mmr/services/mmr-insights.service";
import {
  buildJourney,
  isJourneyRange,
  journeyStart,
  medalStep,
  medalTimeline,
  stretchRecord,
} from "@/modules/mmr/domain/journey";

const NOW = new Date("2026-10-16T12:00:00Z");
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const game = (
  iso: string,
  heroId: number,
  result: "win" | "loss",
  queueClass: HeroRankedResult["queueClass"] = "solo",
): HeroRankedResult => ({ startedAt: d(iso), heroId, result, queueClass });

describe("medal steps and ranges", () => {
  it("counts one step per star, Immortal one above Divine 5", () => {
    expect(medalStep(11)).toBe(0);
    expect(medalStep(15)).toBe(4);
    expect(medalStep(21)).toBe(5);
    expect(medalStep(75)).toBe(34);
    expect(medalStep(80)).toBe(35);
  });

  it("starts ranges in calendar months, all time at the earliest data", () => {
    expect(journeyStart("3m", NOW, null).toISOString()).toBe("2026-07-16T12:00:00.000Z");
    expect(journeyStart("6m", NOW, null).toISOString()).toBe("2026-04-16T12:00:00.000Z");
    expect(journeyStart("1y", NOW, null).toISOString()).toBe("2025-10-16T12:00:00.000Z");
    expect(journeyStart("all", NOW, d("2024-01-01"))).toEqual(d("2024-01-01"));
    expect(journeyStart("all", NOW, null)).toEqual(NOW);
    expect(isJourneyRange("6m")).toBe(true);
    expect(isJourneyRange("2y")).toBe(false);
    expect(isJourneyRange(undefined)).toBe(false);
  });
});

describe("medalTimeline", () => {
  it("carries the medal held at the range start, then lists each change", () => {
    const points = medalTimeline(
      [
        { rankTier: 42, observedAt: d("2026-01-01") },
        { rankTier: 43, observedAt: d("2026-05-01"), lastSeenAt: d("2026-07-30") },
        { rankTier: 44, observedAt: d("2026-08-10"), lastSeenAt: d("2026-10-15") },
      ],
      d("2026-07-16"),
      NOW,
    );
    expect(points).toEqual([
      {
        rankTier: 43,
        at: d("2026-07-16"),
        firstSeenAt: d("2026-05-01"),
        lastSeenAt: d("2026-07-30"),
        carried: true,
      },
      {
        rankTier: 44,
        at: d("2026-08-10"),
        firstSeenAt: d("2026-08-10"),
        lastSeenAt: d("2026-10-15"),
        carried: false,
      },
    ]);
  });

  it("merges repeated sightings of the same medal", () => {
    const points = medalTimeline(
      [
        { rankTier: 52, observedAt: d("2026-09-01"), lastSeenAt: d("2026-09-02") },
        { rankTier: 52, observedAt: d("2026-09-01"), lastSeenAt: d("2026-09-05") },
      ],
      d("2026-08-01"),
      NOW,
    );
    expect(points).toHaveLength(1);
    expect(points[0].lastSeenAt).toEqual(d("2026-09-05"));
  });
});

describe("stretchRecord", () => {
  it("counts games after the start up to and including the end, top heroes first", () => {
    const r = stretchRecord(
      [
        game("2026-09-01", 1, "win"),
        game("2026-09-02", 1, "win"),
        game("2026-09-02", 2, "loss"),
        game("2026-09-03", 3, "win"),
        game("2026-09-04", 4, "loss"),
        game("2026-09-04", 1, "loss"),
        game("2026-09-10", 5, "win"),
      ],
      d("2026-09-01"),
      d("2026-09-04"),
    );
    expect(r).toEqual({
      games: 5,
      wins: 2,
      losses: 3,
      heroes: [
        { heroId: 1, games: 2, wins: 1, losses: 1 },
        { heroId: 3, games: 1, wins: 1, losses: 0 },
        { heroId: 2, games: 1, wins: 0, losses: 1 },
      ],
    });
  });
});

describe("buildJourney", () => {
  const medals = [
    { rankTier: 42, observedAt: d("2026-01-01"), lastSeenAt: d("2026-06-01") },
    { rankTier: 44, observedAt: d("2026-06-03"), lastSeenAt: d("2026-07-01") },
    { rankTier: 51, observedAt: d("2026-07-02"), lastSeenAt: d("2026-08-20") },
    { rankTier: 45, observedAt: d("2026-08-21"), lastSeenAt: d("2026-09-10") },
    { rankTier: 43, observedAt: d("2026-09-11"), lastSeenAt: d("2026-10-15") },
  ];
  const observations = [
    { observedAt: d("2026-05-01"), mmr: 3500 },
    { observedAt: d("2026-05-03"), mmr: 3900 }, // a big jump, but only two days later
    { observedAt: d("2026-06-01"), mmr: 3700 },
    { observedAt: d("2026-07-15"), mmr: 4100 },
    { observedAt: d("2026-09-20"), mmr: 3800 },
  ];
  const matches = [
    game("2026-05-20", 7, "win"),
    game("2026-06-10", 7, "win"),
    game("2026-06-20", 8, "win"),
    game("2026-07-01", 7, "loss"),
    game("2026-08-01", 9, "loss"),
    game("2026-08-02", 9, "loss"),
    game("2026-09-01", 8, "loss"),
  ];

  it("keeps medals and logged MMR apart, with peaks, lows and stretches", () => {
    const j = buildJourney({ range: "1y", now: NOW, medals, observations, matches });
    expect(j.medals.map((m) => m.rankTier)).toEqual([42, 44, 51, 45, 43]);
    expect(j.mmr.map((p) => p.mmr)).toEqual([3500, 3900, 3700, 4100, 3800]);
    expect(j.medalPeak?.rankTier).toBe(51);
    expect(j.medalLow?.rankTier).toBe(42);
    expect(j.mmrPeak).toEqual({ at: d("2026-07-15"), mmr: 4100 });
    expect(j.mmrLow).toEqual({ at: d("2026-05-01"), mmr: 3500 });

    // Medal: Archon 2 → Legend 1 is 4 stars; Legend 1 → Archon 3 is the deepest fall (3 stars).
    expect(j.medalClimb).toMatchObject({ steps: 4, games: 4, wins: 3, losses: 1 });
    expect(j.medalClimb?.from.rankTier).toBe(42);
    expect(j.medalClimb?.to.rankTier).toBe(51);
    expect(j.medalClimb?.heroes[0]).toEqual({ heroId: 7, games: 3, wins: 2, losses: 1 });
    expect(j.medalSlide).toMatchObject({ steps: -3 });
    expect(j.medalSlide?.from.rankTier).toBe(51);
    expect(j.medalSlide?.to.rankTier).toBe(43);
    expect(j.medalSlide?.heroes.map((h) => h.heroId)).toEqual([9, 8]);

    // MMR: 3500 → 3900 is two days apart (too short); 3500 → 4100 over 75 days is the climb.
    expect(j.mmrClimb).toMatchObject({ delta: 600, from: { mmr: 3500 }, to: { mmr: 4100 } });
    expect(j.mmrClimb?.games).toBe(4);
    expect(j.mmrSlide).toMatchObject({ delta: -300, from: { mmr: 4100 }, to: { mmr: 3800 } });
    expect(j.mmrSlide?.heroes).toEqual([
      { heroId: 9, games: 2, wins: 0, losses: 2 },
      { heroId: 8, games: 1, wins: 0, losses: 1 },
    ]);
    expect(j.record).toMatchObject({ games: 7, wins: 3, losses: 4 });
  });

  it("names long gaps between entries instead of filling them", () => {
    const j = buildJourney({ range: "1y", now: NOW, medals, observations, matches });
    expect(j.gaps).toEqual([
      { from: d("2026-06-01"), to: d("2026-07-15"), days: 44 },
      { from: d("2026-07-15"), to: d("2026-09-20"), days: 67 },
    ]);
  });

  it("only counts what's inside the range", () => {
    const j = buildJourney({ range: "3m", now: NOW, medals, observations, matches });
    expect(j.from.toISOString()).toBe("2026-07-16T12:00:00.000Z");
    expect(j.medals[0]).toMatchObject({ rankTier: 51, carried: true, at: j.from });
    expect(j.mmr.map((p) => p.mmr)).toEqual([3800]);
    expect(j.mmrClimb).toBeNull();
    expect(j.mmrSlide).toBeNull();
    expect(j.medalClimb).toBeNull();
    expect(j.medalSlide).toMatchObject({ steps: -3 });
    expect(j.record.games).toBe(3);
  });

  it("has no stretches when nothing moved, and is empty without data", () => {
    const flat = buildJourney({
      range: "all",
      now: NOW,
      medals: [{ rankTier: 33, observedAt: d("2026-01-01") }],
      observations: [
        { observedAt: d("2026-02-01"), mmr: 2000 },
        { observedAt: d("2026-03-01"), mmr: 2000 },
      ],
      matches: [],
    });
    expect(flat.from).toEqual(d("2026-01-01"));
    expect(flat.medalClimb).toBeNull();
    expect(flat.mmrClimb).toBeNull();
    expect(flat.mmrSlide).toBeNull();
    expect(flat.medalPeak).toEqual(flat.medalLow);

    const empty = buildJourney({
      range: "all",
      now: NOW,
      medals: [],
      observations: [],
      matches: [],
    });
    expect(empty).toMatchObject({ medals: [], mmr: [], medalPeak: null, mmrPeak: null });
  });

  it("prefers the shorter of two equal climbs", () => {
    const j = buildJourney({
      range: "all",
      now: NOW,
      medals: [],
      observations: [
        { observedAt: d("2026-01-01"), mmr: 3000 },
        { observedAt: d("2026-02-01"), mmr: 3000 },
        { observedAt: d("2026-03-01"), mmr: 3200 },
      ],
      matches: [],
    });
    expect(j.mmrClimb?.from.at).toEqual(d("2026-02-01"));
  });
});

describe("MmrInsightsService.journey", () => {
  it("loads ranked games from the range start and survives a medal store outage", async () => {
    const ranges: Array<{ from: Date; to: Date }> = [];
    const svc = new MmrInsightsService({
      journal: {
        list: async () => [
          { observedAt: d("2026-08-01"), mmr: 3000 },
          { observedAt: d("2026-09-01"), mmr: 3150 },
        ],
      } as never,
      ranked: {
        rankedResults: async (_id, range) => {
          ranges.push(range);
          return [{ ...game("2026-08-15", 3, "win"), matchId: "1" }];
        },
      },
      medals: {
        history: async () => {
          throw new Error("down");
        },
      },
      now: () => NOW,
    });
    const j = await svc.journey({ userId: "u", accountId32: 1 }, "all");
    expect(ranges).toEqual([{ from: d("2026-08-01"), to: NOW }]);
    expect(j.medals).toEqual([]);
    expect(j.mmrClimb).toMatchObject({ delta: 150, games: 1, wins: 1 });
  });
});
