import { describe, expect, it } from "vitest";
import { isRankTier, medalChanges, shouldRecord } from "@/modules/mmr/domain/medal-history";

const at = (d: string) => new Date(`2026-10-${d}T12:00:00Z`);

describe("medal history", () => {
  it("accepts only real rank tiers", () => {
    expect([11, 55, 75, 80].every(isRankTier)).toBe(true);
    expect([0, 10, 56, 81, 90, null].some((t) => isRankTier(t))).toBe(false);
  });

  it("records a sighting only when the medal changed", () => {
    expect(shouldRecord(null, 63)).toBe(true);
    expect(shouldRecord({ rankTier: 63, observedAt: at("01") }, 63)).toBe(false);
    expect(shouldRecord({ rankTier: 63, observedAt: at("01") }, 64)).toBe(true);
    expect(shouldRecord({ rankTier: 63, observedAt: at("01") }, null)).toBe(false);
  });

  it("lists changes newest first, dated between the last and first sightings", () => {
    const changes = medalChanges([
      { rankTier: 64, observedAt: at("05") },
      { rankTier: 63, observedAt: at("01"), lastSeenAt: at("03") },
      { rankTier: 63, observedAt: at("09") },
    ]);
    expect(changes).toEqual([
      { from: 64, to: 63, at: at("09"), lastSeenBefore: at("05"), direction: "down" },
      { from: 63, to: 64, at: at("05"), lastSeenBefore: at("03"), direction: "up" },
    ]);
  });
});
