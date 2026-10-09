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
      activity: {
        activeDays: async () =>
          new Map([
            ["a", ["2026-09-06", "2026-10-03"]],
            ["b", ["2026-10-04", "2026-10-06"]],
          ]),
      },
      optIns: {
        notifications: async () => ["b", "someone-deleted"],
        email: async () => ["a", "b"],
        discord: async () => [],
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
    expect(o.retention).toMatchObject({ active1: 1, active7: 2, returning: 2 });
    // Only current players count.
    expect(o.optIns).toEqual({ notifications: 1, email: 2, discord: 0 });
  });

  it("shows retention as unavailable when activity fails to load", async () => {
    const svc = new AdminService({
      users: { userRows: async () => [] },
      stats: {
        matchStats: async () => new Map(),
        mmrEntryCounts: async () => new Map(),
        activityCounts: async () => new Map(),
        roomDraftCounts: async () => new Map(),
      },
      profiles: { publicProfile: async () => null },
      ops: { jobFailures: async () => [], cronRuns: async () => [], errorGroups: async () => [] },
      activity: { activeDays: async () => Promise.reject(new Error("db")) },
      optIns: {
        notifications: async () => Promise.reject(new Error("db")),
        email: async () => Promise.reject(new Error("db")),
        discord: async () => Promise.reject(new Error("db")),
      },
    });
    const o = await svc.overview(day(0));
    expect(o.retention).toBeNull();
    expect(o.optIns).toEqual({ notifications: null, email: null, discord: null });
  });
});
