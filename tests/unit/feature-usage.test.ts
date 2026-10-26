import { describe, expect, it, vi } from "vitest";
import { summarizeUsage, usageDay, type UsageRow } from "@/modules/usage/domain/usage";
import { UsageService } from "@/modules/usage/usage.service";

const NOW = new Date("2026-10-26T09:00:00Z");

describe("summarizeUsage", () => {
  it("counts uses and distinct players per feature over 7 and 30 days, today included", () => {
    const rows: UsageRow[] = [
      { day: "2026-10-26", feature: "compare", userId: "a", count: 3 },
      { day: "2026-10-20", feature: "compare", userId: "b", count: 1 },
      { day: "2026-10-19", feature: "compare", userId: "a", count: 2 },
      { day: "2026-09-27", feature: "compare", userId: "c", count: 1 },
      { day: "2026-09-26", feature: "compare", userId: "d", count: 9 },
      { day: "2026-10-25", feature: "pick_for_me", userId: "a", count: 1 },
    ];
    const s = Object.fromEntries(summarizeUsage(rows, NOW).map((f) => [f.feature, f]));
    expect(s.compare.last7).toEqual({ uses: 4, players: 2 });
    expect(s.compare.last30).toEqual({ uses: 7, players: 3 });
    expect(s.pick_for_me.last7).toEqual({ uses: 1, players: 1 });
    // Every feature is listed, used or not.
    expect(s.session_push.last30).toEqual({ uses: 0, players: 0 });
  });

  it("puts a use on its UTC day", () => {
    expect(usageDay(new Date("2026-10-26T23:59:00+08:00"))).toBe("2026-10-26");
    expect(usageDay(new Date("2026-10-27T07:00:00+08:00"))).toBe("2026-10-26");
  });
});

describe("UsageService", () => {
  it("never fails the feature when a counter can't be written", async () => {
    const warn = vi.fn();
    const svc = new UsageService({
      repository: {
        record: async () => Promise.reject(new Error("db")),
        rowsSince: async () => [],
        exportForOwner: async () => [],
        deleteForOwner: async () => 0,
      },
      logger: { warn },
      now: () => NOW,
    });
    await expect(svc.record("compare", "a")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("usage_record_failed", expect.anything());
  });
});
