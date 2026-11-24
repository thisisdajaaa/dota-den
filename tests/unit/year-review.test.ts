import { describe, expect, it } from "vitest";
import { dayKeyFormatter } from "@/common/time/day-key";
import {
  MIN_HERO_GAMES,
  reviewYears,
  yearPromptFor,
  yearReview,
  type YearGame,
} from "@/modules/report/domain/year-review";

const TZ = "Asia/Manila";
const dayKey = dayKeyFormatter(TZ);
let n = 0;
const game = (at: string, over: Partial<YearGame> = {}): YearGame => ({
  matchId: String(++n),
  startedAt: new Date(at),
  durationSec: 2_400,
  heroId: 1,
  won: true,
  kills: 5,
  deaths: 5,
  assists: 5,
  ranked: true,
  queueClass: "solo",
  ...over,
});
const review = (games: YearGame[], year = 2026) =>
  yearReview(games, { year, timeZone: TZ, dayKey });

describe("yearReview", () => {
  it("counts the year in the player's time zone", () => {
    const r = review([
      // 2025-12-31 17:00 UTC is already 2026-01-01 01:00 in Manila.
      game("2025-12-31T17:00:00Z"),
      // 2026-12-31 17:00 UTC is 2027 in Manila: not this year.
      game("2026-12-31T17:00:00Z"),
      game("2026-06-01T12:00:00Z", { won: false }),
    ]);
    expect(r.games).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.months[0]).toEqual({ games: 1, wins: 1 });
    expect(r.hours[1]).toBe(1);
    expect(r.first?.toISOString()).toBe("2025-12-31T17:00:00.000Z");
  });

  it("never counts an unknown party size as solo", () => {
    const r = review([
      game("2026-03-01T10:00:00Z", { queueClass: "unknown" }),
      game("2026-03-01T11:00:00Z", { queueClass: "party", won: false }),
      game("2026-03-01T12:00:00Z", { queueClass: "solo" }),
    ]);
    expect(r.queue).toEqual({
      solo: { games: 1, wins: 1 },
      party: { games: 1, wins: 0 },
      unknown: 1,
    });
  });

  it("finds the longest streaks, the biggest day and the best win", () => {
    const results = [true, true, true, false, false, true, false, false, false, false];
    const r = review(
      results.map((won, i) =>
        game(`2026-04-${String(10 + Math.floor(i / 4)).padStart(2, "0")}T1${i % 4}:00:00Z`, {
          won,
          kills: i === 1 ? 20 : 5,
        }),
      ),
    );
    expect(r.longestWinStreak?.games).toBe(3);
    expect(r.longestLossStreak?.games).toBe(4);
    expect(r.biggestDay).toEqual({ day: "2026-04-10", games: 4, wins: 3 });
    expect(r.bestGame?.kills).toBe(20);
    expect(r.playedSec).toBe(10 * 2_400);
  });

  it("only names a best hero and best month with enough games", () => {
    const few = review([
      ...Array.from({ length: MIN_HERO_GAMES - 1 }, (_, i) =>
        game(`2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`, { heroId: 2 }),
      ),
    ]);
    expect(few.bestHero).toBeNull();
    expect(few.bestMonth).toBeNull();
    expect(few.busiestMonth).toBe(4);

    const many = review([
      ...Array.from({ length: 12 }, (_, i) =>
        game(`2026-07-${String(i + 1).padStart(2, "0")}T10:00:00Z`, { heroId: 3, won: i < 9 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        game(`2026-08-${String(i + 1).padStart(2, "0")}T10:00:00Z`, { heroId: 4, won: i < 5 }),
      ),
    ]);
    expect(many.bestHero?.heroId).toBe(3);
    expect(many.topHeroes.map((h) => h.heroId)).toEqual([3, 4]);
    expect(many.bestMonth).toBe(6);
    expect(many.heroesPlayed).toBe(2);
  });

  it("finds the busiest three hours, across midnight", () => {
    // 23:00, 00:00 and 01:00 in Manila.
    const r = review([
      game("2026-02-01T15:00:00Z"),
      game("2026-02-01T16:00:00Z"),
      game("2026-02-01T17:00:00Z"),
      game("2026-02-02T04:00:00Z"),
    ]);
    expect(r.peakHours).toEqual({ from: 23, games: 3 });
  });

  it("is empty for a year without games", () => {
    const r = review([], 2026);
    expect(r.games).toBe(0);
    expect(r.busiestMonth).toBeNull();
    expect(r.peakHours).toBeNull();
    expect(r.longestWinStreak).toBeNull();
  });
});

describe("reviewYears", () => {
  it("lists from the first game's year to this year, newest first", () => {
    expect(reviewYears(new Date("2024-03-01T00:00:00Z"), "2026-11-24", dayKey)).toEqual([
      2026, 2025, 2024,
    ]);
    expect(reviewYears(null, "2026-11-24", dayKey)).toEqual([2026]);
  });
});

describe("yearPromptFor", () => {
  it("offers this year in December and last year until January 15", () => {
    expect(yearPromptFor("2026-11-30")).toBeNull();
    expect(yearPromptFor("2026-12-01")).toBe(2026);
    expect(yearPromptFor("2026-12-31")).toBe(2026);
    expect(yearPromptFor("2027-01-15")).toBe(2026);
    expect(yearPromptFor("2027-01-16")).toBeNull();
  });
});
