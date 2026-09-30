import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  ESTIMATE_PER_GAME,
  type Observation,
  type RankedResult,
} from "@/modules/mmr/domain/calendar";
import {
  addDays,
  dayKeyFormatter,
  daysBetween,
  isValidTimeZone,
  weekday,
} from "@/modules/mmr/domain/day-key";

const utc = dayKeyFormatter("UTC");
const at = (iso: string) => new Date(iso);
const obs = (iso: string, mmr: number): Observation => ({ observedAt: at(iso), mmr });
const game = (
  iso: string,
  result: "win" | "loss",
  queueClass: RankedResult["queueClass"] = "solo",
): RankedResult => ({
  startedAt: at(iso),
  result,
  queueClass,
});
const period = { from: "2026-09-01", to: "2026-09-30" };

describe("buildCalendar", () => {
  it("records an actual daily change when two entries bracket one day's games", () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-10T08:00:00Z", 5000), obs("2026-09-10T22:00:00Z", 5050)],
      matches: [game("2026-09-10T12:00:00Z", "win"), game("2026-09-10T13:00:00Z", "win")],
      period,
      dayKey: utc,
      scope: "all",
    });
    const day = cal.days.get("2026-09-10")!;
    expect(day.actualDelta).toBe(50);
    expect(day.estimatedDelta).toBe(2 * ESTIMATE_PER_GAME);
    expect(cal.intervals[0]).toMatchObject({ delta: 50, games: 2, singleDay: true });
  });

  it("credits the day the games were played even if entries were logged on other days", () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-09T20:00:00Z", 5000), obs("2026-09-11T08:00:00Z", 5075)],
      matches: [
        game("2026-09-10T12:00:00Z", "win"),
        game("2026-09-10T14:00:00Z", "win"),
        game("2026-09-10T16:00:00Z", "win"),
      ],
      period,
      dayKey: utc,
      scope: "all",
    });
    expect(cal.days.get("2026-09-10")!.actualDelta).toBe(75);
    expect(cal.days.get("2026-09-11")?.actualDelta ?? null).toBeNull();
    expect(cal.intervals[0]).toMatchObject({ singleDay: true, gameDay: "2026-09-10" });
  });

  it("attributes nothing to a day when entries change with no games between them", () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-10T08:00:00Z", 5000), obs("2026-09-10T09:00:00Z", 5100)],
      matches: [],
      period,
      dayKey: utc,
      scope: "all",
    });
    expect(cal.days.get("2026-09-10")!.actualDelta).toBeNull();
    expect(cal.intervals[0]).toMatchObject({ delta: 100, games: 0, singleDay: false });
  });

  it("never invents a daily actual when the change spans several days", () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-10T08:00:00Z", 5000), obs("2026-09-12T22:00:00Z", 4975)],
      matches: [game("2026-09-10T12:00:00Z", "loss"), game("2026-09-12T12:00:00Z", "win")],
      period,
      dayKey: utc,
      scope: "all",
    });
    expect(cal.days.get("2026-09-10")!.actualDelta).toBeNull();
    expect(cal.days.get("2026-09-12")!.actualDelta).toBeNull();
    expect(cal.intervals[0]).toMatchObject({ delta: -25, games: 2, singleDay: false });
    expect(cal.summary.actualNet).toBeNull(); // no entry before the period starts
  });

  it("buckets games by the viewer's local day, not UTC", () => {
    const manila = dayKeyFormatter("Asia/Manila"); // UTC+8
    const cal = buildCalendar({
      observations: [],
      matches: [game("2026-09-10T17:00:00Z", "win")], // 01:00 on Sep 11 in Manila
      period,
      dayKey: manila,
      scope: "all",
    });
    expect(cal.days.has("2026-09-11")).toBe(true);
    expect(cal.days.has("2026-09-10")).toBe(false);
  });

  it("only attributes an actual change to a queue scope when every game in it matches", () => {
    const input = {
      observations: [obs("2026-09-10T08:00:00Z", 5000), obs("2026-09-10T22:00:00Z", 5000)],
      matches: [
        game("2026-09-10T12:00:00Z", "win", "solo"),
        game("2026-09-10T13:00:00Z", "loss", "party"),
      ],
      period,
      dayKey: utc,
    };
    expect(buildCalendar({ ...input, scope: "all" }).days.get("2026-09-10")!.actualDelta).toBe(0);
    const solo = buildCalendar({ ...input, scope: "solo" }).days.get("2026-09-10")!;
    expect(solo.actualDelta).toBeNull();
    expect(solo).toMatchObject({ games: 1, wins: 1, estimatedDelta: ESTIMATE_PER_GAME });
  });

  it("summarises the period with actual net from entries on both sides", () => {
    const cal = buildCalendar({
      observations: [obs("2026-08-31T20:00:00Z", 4900), obs("2026-09-15T20:00:00Z", 5010)],
      matches: [
        game("2026-09-02T12:00:00Z", "win"),
        game("2026-09-03T12:00:00Z", "win"),
        game("2026-09-04T12:00:00Z", "loss"),
      ],
      period,
      dayKey: utc,
      scope: "all",
    });
    expect(cal.summary).toMatchObject({
      games: 3,
      wins: 2,
      losses: 1,
      actualNet: 110,
      estimatedNet: ESTIMATE_PER_GAME,
      currentMmr: { mmr: 5010 },
    });
    expect(cal.summary.best?.key).toMatch(/2026-09-0[23]/);
    expect(cal.summary.worst?.key).toBe("2026-09-04");
  });

  it("has no actual net for a queue scope, since MMR isn't tracked per queue", () => {
    const cal = buildCalendar({
      observations: [obs("2026-08-31T20:00:00Z", 4900), obs("2026-09-15T20:00:00Z", 5010)],
      matches: [],
      period,
      dayKey: utc,
      scope: "party",
    });
    expect(cal.summary.actualNet).toBeNull();
  });

  it("ignores games and entries outside the period", () => {
    const cal = buildCalendar({
      observations: [obs("2026-10-02T08:00:00Z", 5000)],
      matches: [game("2026-08-15T12:00:00Z", "win"), game("2026-10-01T12:00:00Z", "win")],
      period,
      dayKey: utc,
      scope: "all",
    });
    expect(cal.days.size).toBe(0);
    expect(cal.summary.games).toBe(0);
    expect(cal.summary.winRate).toBeNull();
  });
});

describe("day keys", () => {
  it("does civil-date arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(weekday("2026-09-27")).toBe(0); // Sunday
  });

  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Asia/Manila")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("periodFor", () => {
  it("computes Sunday-first weeks, months, years and all-time", async () => {
    const { periodFor, isDayKey } = await import("@/modules/mmr/domain/periods");
    expect(periodFor("week", "2026-09-30", "2026-09-30", null)).toMatchObject({
      from: "2026-09-27",
      to: "2026-10-03",
      prev: "2026-09-20",
      next: "2026-10-04",
    });
    expect(periodFor("month", "2026-02-14", "2026-09-30", null)).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(periodFor("month", "2026-12-05", "2026-09-30", null)).toMatchObject({
      next: "2027-01-01",
    });
    expect(periodFor("month", "2026-01-05", "2026-09-30", null)).toMatchObject({
      prev: "2025-12-01",
    });
    expect(periodFor("year", "2026-06-01", "2026-09-30", null)).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(periodFor("all", "2026-06-01", "2026-09-30", "2024-03-02")).toMatchObject({
      from: "2024-03-02",
      to: "2026-09-30",
    });
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-09-30")).toBe(true);
    expect(isDayKey("../etc")).toBe(false);
  });

  it("doesn't call the period change exact when games came after the last entry", async () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-28T10:00:00Z", 4000)],
      matches: [game("2026-10-02T12:00:00Z", "win"), game("2026-10-03T12:00:00Z", "win")],
      period: { from: "2026-10-01", to: "2026-10-31" },
      dayKey: utc,
      scope: "all",
    });
    expect(cal.summary.actualNet).toBeNull();
    expect(cal.summary.estimatedNet).toBe(50);
  });

  it("doesn't count games before the period into its exact change", async () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-28T10:00:00Z", 4000), obs("2026-10-05T10:00:00Z", 4100)],
      matches: [game("2026-09-29T12:00:00Z", "win"), game("2026-10-02T12:00:00Z", "win")],
      period: { from: "2026-10-01", to: "2026-10-31" },
      dayKey: utc,
      scope: "all",
    });
    expect(cal.summary.actualNet).toBeNull();
  });

  it("is exact when entries bracket the period's games", async () => {
    const cal = buildCalendar({
      observations: [obs("2026-09-30T10:00:00Z", 4000), obs("2026-10-05T10:00:00Z", 4050)],
      matches: [game("2026-10-02T12:00:00Z", "win"), game("2026-10-03T12:00:00Z", "win")],
      period: { from: "2026-10-01", to: "2026-10-31" },
      dayKey: utc,
      scope: "all",
    });
    expect(cal.summary.actualNet).toBe(50);
  });

  it("never pins a day's exact change on a span reaching outside the loaded games", async () => {
    const cal = buildCalendar({
      observations: [obs("2026-10-20T10:00:00Z", 4000), obs("2026-11-03T20:00:00Z", 3950)],
      // Only November's games were loaded; three October losses are in the span too.
      matches: [game("2026-11-03T12:00:00Z", "win")],
      period: { from: "2026-11-01", to: "2026-11-30" },
      dayKey: utc,
      scope: "all",
      loaded: { from: new Date("2026-10-31T09:00:00Z"), to: new Date("2026-12-01T15:00:00Z") },
    });
    expect(cal.days.get("2026-11-03")!.actualDelta).toBeNull();
  });
});
