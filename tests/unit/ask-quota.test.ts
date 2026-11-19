import { describe, expect, it } from "vitest";
import { askDay, askQuota, nextReset } from "@/modules/assistant/domain/ask-quota";

const limits = { free: 5, plus: 100 };

describe("Ask Den's daily allowance (Manila days)", () => {
  it("counts on the Manila calendar day, which starts at 16:00 UTC the day before", () => {
    expect(askDay(new Date("2026-11-18T15:59:59Z"))).toBe("2026-11-18");
    expect(askDay(new Date("2026-11-18T16:00:00Z"))).toBe("2026-11-19");
    // 7:30 am in Manila is still "yesterday" in UTC, but today here.
    expect(askDay(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
  });

  it("resets at the next Manila midnight", () => {
    expect(nextReset(new Date("2026-11-18T10:00:00Z")).toISOString()).toBe(
      "2026-11-18T16:00:00.000Z",
    );
    expect(nextReset(new Date("2026-11-18T16:00:00Z")).toISOString()).toBe(
      "2026-11-19T16:00:00.000Z",
    );
    // Across a month and a year end.
    expect(nextReset(new Date("2026-12-31T17:00:00Z")).toISOString()).toBe(
      "2027-01-01T16:00:00.000Z",
    );
  });

  it("gives free players 5 and Plus 100, never below zero", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(askQuota({ plus: false, used: 2, now, limits })).toEqual({
      plus: false,
      limit: 5,
      used: 2,
      remaining: 3,
      resetsAt: "2026-11-18T16:00:00.000Z",
    });
    expect(askQuota({ plus: false, used: 7, now, limits }).remaining).toBe(0);
    expect(askQuota({ plus: true, used: 7, now, limits })).toMatchObject({
      limit: 100,
      remaining: 93,
    });
  });
});
