import { describe, expect, it } from "vitest";
import { AdminService } from "@/modules/admin/admin.service";

const day = (n: number) => new Date(Date.UTC(2026, 9, 6) - n * 86_400_000);

describe("AdminService", () => {
  it("joins per-user stats, sorts by last seen and tolerates failing ops sections", async () => {
    const svc = new AdminService({
      users: {
        userRows: async () => [
          {
            userId: "a",
            accountId32: 1,
            createdAt: day(30),
            isAdmin: false,
            profileVisibility: "public",
            sessions: 1,
            lastSeenAt: day(3),
          },
          {
            userId: "b",
            accountId32: 2,
            createdAt: day(2),
            isAdmin: true,
            profileVisibility: "private",
            sessions: 2,
            lastSeenAt: day(0),
          },
        ],
      },
      stats: {
        matchStats: async () =>
          new Map([[1, { matches: 40, lastSyncAt: day(1), backfillComplete: true }]]),
        mmrEntryCounts: async () => new Map([["a", 5]]),
        activityCounts: async () => new Map([["b", { drafts: 3, challenges: 7 }]]),
        roomDraftCounts: async () => new Map(),
      },
      profiles: {
        publicProfile: async (id) =>
          id === 2
            ? Promise.reject(new Error("rate limited"))
            : { personaName: "A", avatarUrl: null, rankTier: 55, leaderboardRank: null },
      },
      ops: {
        jobFailures: async () => [],
        cronRuns: async () => Promise.reject(new Error("db")),
        errorGroups: async () => [],
      },
    });
    const o = await svc.overview(day(0));
    expect(o.users.map((u) => [u.userId, u.mmrEntries, u.drafts, u.stats?.matches ?? 0])).toEqual([
      ["b", 0, 3, 0],
      ["a", 5, 0, 40],
    ]);
    expect(o.users[0].profile).toBeNull();
    expect(o.cronRuns).toBeNull();
    expect(o.totals).toMatchObject({ users: 2, newThisWeek: 1, withMatches: 1, listedPublicly: 1 });
  });
});
