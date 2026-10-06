import { describe, expect, it } from "vitest";
import { AchievementsService } from "@/modules/achievements/achievements.service";

describe("AchievementsService", () => {
  it("counts MMR days in the player's time zone", async () => {
    const svc = new AchievementsService({
      sessions: { rankedSessions: async () => [] },
      // 23:30 and 00:30 UTC: two days in UTC, one day in UTC+8 (both 07:30/08:30).
      mmr: {
        entryTimes: async () => [
          new Date("2026-10-05T23:30:00Z"),
          new Date("2026-10-06T00:30:00Z"),
        ],
      },
      activity: { counts: async () => ({ drafts: 0, challenges: 0 }) },
    });
    const owner = { userId: "u", accountId32: 1 };
    const logger = (list: Awaited<ReturnType<typeof svc.forPlayer>>) =>
      list.find((a) => a.description.toLowerCase().includes("mmr"))?.value;
    expect(logger(await svc.forPlayer(owner, "UTC"))).toBe(2);
    expect(logger(await svc.forPlayer(owner, "Asia/Manila"))).toBe(1);
  });
});
