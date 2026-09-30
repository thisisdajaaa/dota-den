import { describe, expect, it } from "vitest";
import {
  formatSpan,
  mmrLabel,
  recapHeadline,
  sessionTimeLabels,
  signedMmr,
} from "@/modules/sessions/domain/session-labels";

describe("sessionTimeLabels", () => {
  const start = new Date("2026-09-29T20:05:00Z");
  const end = new Date("2026-09-29T23:15:00Z");

  it("formats the date and time range in the viewer's time zone", () => {
    expect(sessionTimeLabels(start, end, "UTC")).toEqual({
      date: "Tue, Sep 29, 2026",
      timeRange: "8:05 PM – 11:15 PM",
      dayKey: "2026-09-29",
    });
  });

  it("moves the local day and marks sessions that run past local midnight", () => {
    // UTC+9: 05:05 → 08:15 on Sep 30.
    expect(sessionTimeLabels(start, end, "Asia/Tokyo")).toEqual({
      date: "Wed, Sep 30, 2026",
      timeRange: "5:05 AM – 8:15 AM",
      dayKey: "2026-09-30",
    });
    // UTC−4 (EDT): 4:05 PM → 7:15 PM same day; UTC+2: 10:05 PM → 1:15 AM next day.
    expect(sessionTimeLabels(start, end, "America/New_York").timeRange).toBe("4:05 PM – 7:15 PM");
    expect(sessionTimeLabels(start, end, "Europe/Berlin").timeRange).toBe(
      "10:05 PM – 1:15 AM (+1 day)",
    );
  });
});

describe("recap text", () => {
  it("formats spans and signed MMR", () => {
    expect(formatSpan(3 * 3600 + 10 * 60)).toBe("3h 10m");
    expect(formatSpan(45 * 60)).toBe("45m");
    expect(formatSpan(0)).toBe("0m");
    expect(signedMmr(50)).toBe("+50");
    expect(signedMmr(-25)).toBe("−25");
    expect(signedMmr(0)).toBe("±0");
  });

  it("labels exact and estimated changes differently", () => {
    const stats = { wins: 4, losses: 2, spanSec: 3 * 3600 + 10 * 60 };
    const exact = {
      kind: "exact" as const,
      delta: 50,
      from: { observedAt: new Date(0), mmr: 5000 },
      to: { observedAt: new Date(1), mmr: 5050 },
    };
    expect(recapHeadline(stats, exact)).toBe("4–2 in 3h 10m, +50 MMR (exact)");
    expect(
      recapHeadline(stats, {
        kind: "estimate",
        delta: 50,
        rankedGames: 6,
        perGame: 25,
        reason: "no_entries",
      }),
    ).toBe("4–2 in 3h 10m, ≈ +50 MMR (estimate)");
    expect(recapHeadline(stats, { kind: "none" })).toBe("4–2 in 3h 10m, no ranked games");
    expect(mmrLabel({ kind: "none" })).toBeNull();
  });
});
