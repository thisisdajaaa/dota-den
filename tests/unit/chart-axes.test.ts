import { describe, expect, it } from "vitest";
import { mmrTicks, tickLabel, timeDomain, timeTicks } from "@/common/charts/axes";

const DAY = 86_400_000;
const at = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe("chart axes", () => {
  it("puts MMR on round ticks, a handful of them", () => {
    expect(mmrTicks(4250, 5380).ticks).toEqual([4000, 4500, 5000, 5500]);
    expect(mmrTicks(3100, 3400).ticks).toEqual([3000, 3100, 3200, 3300, 3400, 3500]);
    const flat = mmrTicks(3000, 3000);
    expect(flat.min).toBeLessThan(3000);
    expect(flat.max).toBeGreaterThan(3000);
  });

  it("trims the time axis to where the data starts, never before the range", () => {
    const from = at("2026-05-24");
    const to = at("2026-11-24");
    const d = timeDomain(from, to, at("2026-10-01"));
    expect(d.from).toBeGreaterThan(at("2026-09-25"));
    expect(d.from).toBeLessThan(at("2026-10-01"));
    expect(timeDomain(from, to, at("2026-04-01"))).toEqual({ from, to });
    expect(timeDomain(from, to, null)).toEqual({ from, to });
  });

  it("ticks by month, then half-month, then week", () => {
    expect(timeTicks(at("2026-05-24"), at("2026-11-24")).map((t) => t.short)).toEqual(
      Array(6).fill(false),
    );
    const half = timeTicks(at("2026-09-28"), at("2026-11-24"));
    expect(half.map((t) => tickLabel(t, at("2026-11-24") - at("2026-09-28")))).toEqual([
      "Oct",
      "Oct 15",
      "Nov",
      "Nov 15",
    ]);
    expect(timeTicks(at("2026-11-01"), at("2026-11-24")).length).toBeGreaterThanOrEqual(3);
    expect(timeTicks(at("2026-11-20"), at("2026-11-24") + DAY).length).toBeGreaterThanOrEqual(3);
  });

  it("adds the year to month ticks across a year", () => {
    expect(tickLabel({ t: at("2026-01-01"), short: false }, 400 * DAY)).toBe("Jan 26");
  });
});
