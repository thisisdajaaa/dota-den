import { describe, expect, it } from "vitest";
import { ActivityService } from "@/modules/leaderboards/application/activity-service";
import { LeaderboardService } from "@/modules/leaderboards/application/leaderboard-service";
import type {
  ActivityRepository,
  DraftReferee,
  PlayerAccount,
  TotalsQuery,
} from "@/modules/leaderboards/application/ports";
import {
  bestStreakOf,
  isCorrectGrade,
  nextStreak,
  NO_STREAK,
  type ChallengeAttempt,
  type ChallengeStreak,
  type DraftResult,
} from "@/modules/leaderboards/domain/activity";
import { draftScoreFor } from "@/modules/leaderboards/domain/draft-score";
import { periodStart } from "@/modules/leaderboards/domain/period";
import {
  challengeStanding,
  CHALLENGE_KEYS,
  draftStanding,
  DRAFT_KEYS,
  inScope,
  rankBy,
  topWithViewer,
  type ChallengeTotals,
  type DraftTotals,
  type RoomTotals,
} from "@/modules/leaderboards/domain/ranking";
import { ok, err } from "@/common/result";

describe("streak rule", () => {
  it("counts Good or better as correct", () => {
    expect(isCorrectGrade("excellent")).toBe(true);
    expect(isCorrectGrade("good")).toBe(true);
    expect(isCorrectGrade("playable")).toBe(false);
    expect(isCorrectGrade("risky")).toBe(false);
  });

  it("extends on a correct answer, resets on a miss and keeps the best", () => {
    let s: ChallengeStreak = NO_STREAK;
    for (const c of [true, true, true, false, true]) s = nextStreak(s, c);
    expect(s).toEqual({ current: 1, best: 3 });
    expect(bestStreakOf([false, true, true, false, true, true, true, true])).toBe(4);
    expect(bestStreakOf([])).toBe(0);
  });
});

describe("periods", () => {
  it("starts the week on Monday 00:00 UTC", () => {
    // Wednesday 30 Sep 2026, 15:00 UTC -> Monday 28 Sep.
    expect(periodStart("week", new Date("2026-09-30T15:00:00Z"))?.toISOString()).toBe(
      "2026-09-28T00:00:00.000Z",
    );
    // Sunday late evening still belongs to the week that started the Monday before.
    expect(periodStart("week", new Date("2026-10-04T23:59:59Z"))?.toISOString()).toBe(
      "2026-09-28T00:00:00.000Z",
    );
    // Monday midnight starts a new week.
    expect(periodStart("week", new Date("2026-10-05T00:00:00Z"))?.toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("has no start for all time", () => {
    expect(periodStart("all", new Date())).toBeNull();
  });
});

describe("draft score", () => {
  const report = {
    radiant: { criteria: [], overall: 71.26, grade: "B" },
    dire: { criteria: [], overall: null, grade: null },
  };

  it("uses the report card's overall score and grade for your side", () => {
    expect(draftScoreFor({ radiantPct: 55, report }, "radiant")).toEqual({
      score: 71.3,
      grade: "B",
    });
  });

  it("falls back to your side of the win estimate when the report has no overall", () => {
    expect(draftScoreFor({ radiantPct: 55, report }, "dire")).toEqual({ score: 45, grade: null });
    expect(draftScoreFor({ radiantPct: 40 }, "radiant")).toEqual({ score: 40, grade: null });
    expect(draftScoreFor({ radiantPct: 40, report: "junk" }, "dire")).toEqual({
      score: 60,
      grade: null,
    });
  });

  it("returns null when there is nothing to score, and ignores unknown grades", () => {
    expect(draftScoreFor({ radiantPct: null }, "radiant")).toBeNull();
    expect(
      draftScoreFor({ radiantPct: null, report: { dire: { overall: 120, grade: "S" } } }, "dire"),
    ).toEqual({ score: 100, grade: null });
  });
});

describe("ranking", () => {
  const drafts = (userId: string, n: number, best: number | null, avg = best): DraftTotals => ({
    userId,
    drafts: n,
    scored: best === null ? 0 : 1,
    scoreSum: avg ?? 0,
    bestScore: best,
    bestGrade: null,
  });

  it("gives tied players the same rank and skips the next ones (1, 1, 3)", () => {
    const ranked = rankBy(
      [drafts("c", 2, 60), drafts("a", 5, 70), drafts("b", 5, 70), drafts("d", 1, null)].map(
        draftStanding,
      ),
      DRAFT_KEYS,
    );
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("breaks ties on the next metric, and a missing score ranks below any score", () => {
    const ranked = rankBy(
      [drafts("a", 3, null), drafts("b", 3, 10), drafts("c", 3, 90)].map(draftStanding),
      DRAFT_KEYS,
    );
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ["c", 1],
      ["b", 2],
      ["a", 3],
    ]);
  });

  it("ranks challenges by correct answers, then best streak, then accuracy", () => {
    const rows: ChallengeTotals[] = [
      { userId: "a", answered: 10, correct: 5, bestStreak: 2 },
      { userId: "b", answered: 5, correct: 5, bestStreak: 5 },
      { userId: "c", answered: 6, correct: 5, bestStreak: 5 },
    ];
    const ranked = rankBy(rows.map(challengeStanding), CHALLENGE_KEYS);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
    expect(ranked[0].accuracy).toBe(1);
  });

  it("keeps only players in scope, and shows your row below the cut", () => {
    const all = [{ userId: "a" }, { userId: "b" }, { userId: "c" }];
    expect(inScope(all, new Set(["a", "c"])).map((r) => r.userId)).toEqual(["a", "c"]);
    expect(inScope(all, null)).toHaveLength(3);
    const ranked = rankBy(
      [drafts("a", 3, 1), drafts("b", 2, 1), drafts("me", 1, 1)].map(draftStanding),
      DRAFT_KEYS,
    );
    const { rows, viewerBelowCut } = topWithViewer(ranked, "me", 2);
    expect(rows.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(viewerBelowCut).toMatchObject({ userId: "me", rank: 3 });
    expect(topWithViewer(ranked, "a", 2).viewerBelowCut).toBeNull();
  });
});

/** In-memory activity store that applies the query like the Mongo repository does. */
class MemoryActivity implements ActivityRepository {
  attempts: ChallengeAttempt[] = [];
  drafts: DraftResult[] = [];
  streaks = new Map<string, ChallengeStreak>();
  queries: TotalsQuery[] = [];

  private matches(q: TotalsQuery, userId: string, at: Date) {
    return (!q.since || at >= q.since) && (!q.userIds || q.userIds.includes(userId));
  }
  async insertAttempt(a: ChallengeAttempt) {
    if (this.attempts.some((x) => x.userId === a.userId && x.type === a.type && x.seed === a.seed))
      return "duplicate" as const;
    this.attempts.push(a);
    return "inserted" as const;
  }
  async applyToStreak(userId: string, correct: boolean) {
    const s = nextStreak(this.streaks.get(userId) ?? NO_STREAK, correct);
    this.streaks.set(userId, s);
    return s;
  }
  async streakOf(userId: string) {
    return this.streaks.get(userId) ?? NO_STREAK;
  }
  async insertDraft(d: DraftResult) {
    if (this.drafts.some((x) => x.userId === d.userId && x.snapshotHash === d.snapshotHash))
      return "duplicate" as const;
    this.drafts.push(d);
    return "inserted" as const;
  }
  async draftTotals(q: TotalsQuery): Promise<DraftTotals[]> {
    this.queries.push(q);
    const by = new Map<string, DraftTotals>();
    for (const d of this.drafts.filter((x) => this.matches(q, x.userId, x.completedAt))) {
      const t = by.get(d.userId) ?? {
        userId: d.userId,
        drafts: 0,
        scored: 0,
        scoreSum: 0,
        bestScore: null,
        bestGrade: null,
      };
      t.drafts++;
      if (d.score !== null) {
        t.scored++;
        t.scoreSum += d.score;
        if (t.bestScore === null || d.score > t.bestScore) {
          t.bestScore = d.score;
          t.bestGrade = d.grade;
        }
      }
      by.set(d.userId, t);
    }
    return [...by.values()];
  }
  async challengeTotals(q: TotalsQuery): Promise<ChallengeTotals[]> {
    this.queries.push(q);
    const by = new Map<string, ChallengeAttempt[]>();
    for (const a of this.attempts.filter((x) => this.matches(q, x.userId, x.at))) {
      by.set(a.userId, [...(by.get(a.userId) ?? []), a]);
    }
    return [...by].map(([userId, xs]) => ({
      userId,
      answered: xs.length,
      correct: xs.filter((x) => x.correct).length,
      bestStreak: bestStreakOf(xs.map((x) => x.correct)),
    }));
  }
}

const NOW = new Date("2026-09-30T12:00:00Z");
const LAST_WEEK = new Date("2026-09-25T12:00:00Z");
const accountOf = (userId: string): PlayerAccount => ({
  userId,
  accountId32: Number(userId.slice(1)),
  name: `Saved ${userId}`,
  avatarUrl: null,
});

function setup(
  opts: {
    friendAccounts?: number[];
    rooms?: RoomTotals[];
    incomplete?: boolean;
    rowLimit?: number;
    /** Users listed publicly (default: everyone). */
    listed?: string[];
  } = {},
) {
  const activity = new MemoryActivity();
  // Users u1..u5 have accounts; account 99 is a friend without a Dota Den account.
  const users = ["u1", "u2", "u3", "u4", "u5"].map(accountOf);
  const roomQueries: TotalsQuery[] = [];
  const service = new LeaderboardService({
    activity,
    rooms: {
      totals: async (q) => {
        roomQueries.push(q);
        return (opts.rooms ?? []).filter((r) => !q.userIds || q.userIds.includes(r.userId));
      },
    },
    accounts: {
      byUserIds: async (ids) => users.filter((u) => ids.includes(u.userId)),
      byAccountIds: async (ids) => users.filter((u) => ids.includes(u.accountId32)),
      publicUserIds: async () => opts.listed ?? users.map((u) => u.userId),
    },
    profiles: {
      profile: async (id) =>
        id === 3
          ? null // OpenDota couldn't provide this one
          : { personaName: `Player ${id}`, avatarUrl: null, rankTier: 54, leaderboardRank: null },
    },
    friends: {
      friendAccountIds: async () => ({
        accountIds: opts.friendAccounts ?? [2, 3, 99],
        incomplete: opts.incomplete ?? false,
      }),
    },
    rowLimit: opts.rowLimit,
  });
  const draft = (userId: string, hash: string, at: Date, score: number | null = 50) =>
    activity.drafts.push({
      userId,
      mode: score === null ? "practice" : "ai",
      side: score === null ? null : "radiant",
      score,
      grade: null,
      snapshotHash: hash,
      rulesetId: "cm-2026",
      rulesetVersion: 1,
      completedAt: at,
    });
  return { service, activity, draft, roomQueries };
}

const viewer = { userId: "u1", accountId32: 1 };

describe("LeaderboardService", () => {
  it("scopes the friends board to you and friends with accounts", async () => {
    const { service, draft, activity } = setup();
    draft("u1", "a", NOW);
    draft("u2", "b", NOW);
    draft("u2", "c", NOW);
    draft("u4", "d", NOW); // not a friend
    const view = await service.board({
      viewer,
      kind: "drafts",
      scope: "friends",
      period: "all",
      now: NOW,
    });
    expect(view.kind).toBe("drafts");
    expect(view.rows.map((r) => [r.rank, r.player.name, r.player.isYou])).toEqual([
      [1, "Player 2", false],
      [2, "Player 1", true],
    ]);
    // Friends are the viewer plus friends with accounts; account 99 has none.
    expect(view.friendsWithAccounts).toBe(2);
    expect([...(activity.queries[0].userIds ?? [])].sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("shows publicly listed players on the everyone board", async () => {
    const { service, draft } = setup();
    draft("u1", "a", NOW);
    draft("u4", "d", NOW);
    const view = await service.board({
      viewer,
      kind: "drafts",
      scope: "everyone",
      period: "all",
      now: NOW,
    });
    expect(view.rows).toHaveLength(2);
    expect(view.friendsWithAccounts).toBeNull();
  });

  it("keeps unlisted players off the everyone board, but always shows you", async () => {
    const { service, draft, activity } = setup({ listed: ["u2"] });
    draft("u1", "a", NOW);
    draft("u2", "b", NOW);
    draft("u4", "d", NOW);
    const view = await service.board({
      viewer,
      kind: "drafts",
      scope: "everyone",
      period: "all",
      now: NOW,
    });
    expect(view.rows.map((r) => r.player.accountId32).sort()).toEqual([1, 2]);
    expect([...(activity.queries[0].userIds ?? [])].sort()).toEqual(["u1", "u2"]);
  });

  it("counts only this week on the weekly board", async () => {
    const { service, draft, activity } = setup();
    draft("u1", "a", NOW);
    draft("u2", "b", LAST_WEEK);
    draft("u2", "c", LAST_WEEK);
    const week = await service.board({
      viewer,
      kind: "drafts",
      scope: "friends",
      period: "week",
      now: NOW,
    });
    expect(activity.queries[0].since?.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(week.rows.map((r) => r.player.accountId32)).toEqual([1]);
    const all = await service.board({
      viewer,
      kind: "drafts",
      scope: "friends",
      period: "all",
      now: NOW,
    });
    expect(all.rows.map((r) => r.player.accountId32)).toEqual([2, 1]);
  });

  it("falls back to the saved name when the public profile is unavailable", async () => {
    const { service, activity } = setup();
    activity.attempts.push({
      userId: "u3",
      type: "last_pick",
      seed: "abcd",
      grade: "good",
      correct: true,
      at: NOW,
    });
    const view = await service.board({
      viewer,
      kind: "challenges",
      scope: "friends",
      period: "all",
      now: NOW,
    });
    expect(view.rows[0].player).toMatchObject({ name: "Saved u3", rankTier: null });
  });

  it("reports when you have no friends with accounts", async () => {
    const { service } = setup({ friendAccounts: [99], incomplete: true });
    const view = await service.board({
      viewer,
      kind: "rooms",
      scope: "friends",
      period: "week",
      now: NOW,
    });
    expect(view.rows).toEqual([]);
    expect(view.friendsWithAccounts).toBe(0);
    expect(view.friendsIncomplete).toBe(true);
  });

  it("ranks room drafts, then self-reported wins", async () => {
    const { service } = setup({
      rooms: [
        { userId: "u1", drafts: 2, wins: 0, losses: 1 },
        { userId: "u2", drafts: 2, wins: 1, losses: 0 },
        { userId: "u4", drafts: 9, wins: 9, losses: 0 },
      ],
    });
    const view = await service.board({
      viewer,
      kind: "rooms",
      scope: "friends",
      period: "all",
      now: NOW,
    });
    expect(view.rows.map((r) => [r.rank, r.player.accountId32])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it("puts your row below the cut when you're not in the top rows", async () => {
    const { service: svc, draft } = setup({ rowLimit: 1 });
    draft("u2", "a", NOW);
    draft("u2", "b", NOW);
    draft("u1", "c", NOW);
    const view = await svc.board({
      viewer,
      kind: "drafts",
      scope: "friends",
      period: "all",
      now: NOW,
    });
    expect(view.rows.map((r) => r.player.accountId32)).toEqual([2]);
    expect(view.youBelowCut).toMatchObject({ rank: 2, player: { isYou: true } });
  });

  it("summarises your standing on every friends board", async () => {
    const { service, draft } = setup({ rooms: [{ userId: "u2", drafts: 1, wins: 0, losses: 0 }] });
    draft("u1", "a", NOW);
    draft("u2", "b", NOW);
    draft("u1", "c", LAST_WEEK);
    const standing = await service.standing(viewer);
    expect(standing).toEqual([
      { kind: "drafts", rank: 1, players: 2, value: 2 },
      { kind: "challenges", rank: null, players: 0, value: 0 },
      { kind: "rooms", rank: null, players: 1, value: 0 },
    ]);
  });
});

describe("ActivityService", () => {
  function activitySetup(replay: Awaited<ReturnType<DraftReferee["replay"]>>) {
    const repo = new MemoryActivity();
    const outlookCalls: string[] = [];
    const service = new ActivityService({
      repo,
      referee: {
        replay: async () => replay,
        outlook: async (canonical) => {
          outlookCalls.push(canonical);
          return {
            radiantPct: 58,
            report: { radiant: { overall: 64, grade: "B" }, dire: { overall: 41, grade: "D" } },
          };
        },
      },
      hash: (text) => `hash(${text})`,
      now: () => NOW,
    });
    return { repo, service, outlookCalls };
  }
  const done = ok({ canonical: "CANON", completed: true, rulesetId: "cm-2026", rulesetVersion: 1 });

  it("counts only the first answer to a puzzle, for the streak too", async () => {
    const { service } = activitySetup(done);
    const answer = { type: "last_pick", seed: "abcd", grade: "good" as const };
    expect(await service.recordChallenge("u1", answer)).toEqual({
      counted: true,
      streak: { current: 1, best: 1 },
    });
    // Same puzzle again, worse grade: nothing changes.
    expect(await service.recordChallenge("u1", { ...answer, grade: "risky" })).toEqual({
      counted: false,
      streak: { current: 1, best: 1 },
    });
    expect(
      await service.recordChallenge("u1", { type: "last_pick", seed: "efgh", grade: "risky" }),
    ).toEqual({ counted: true, streak: { current: 0, best: 1 } });
  });

  it("scores your side against the AI and counts the same draft once", async () => {
    const { service, repo } = activitySetup(done);
    // The AI plays Radiant, so you drafted Dire.
    const first = await service.recordDraft("u1", { snapshot: "raw", aiSide: "radiant" });
    expect(first).toEqual(ok({ counted: true, mode: "ai", side: "dire", score: 41, grade: "D" }));
    expect(repo.drafts[0].snapshotHash).toBe("hash(CANON)");
    const again = await service.recordDraft("u1", { snapshot: "raw", aiSide: "radiant" });
    expect(again.ok && again.value.counted).toBe(false);
    expect(repo.drafts).toHaveLength(1);
  });

  it("stores practice drafts without a side or score", async () => {
    const { service, outlookCalls } = activitySetup(done);
    const res = await service.recordDraft("u1", { snapshot: "raw", aiSide: null });
    expect(res).toEqual(
      ok({ counted: true, mode: "practice", side: null, score: null, grade: null }),
    );
    expect(outlookCalls).toEqual([]);
  });

  it("rejects unfinished and invalid drafts", async () => {
    const unfinished = activitySetup(
      ok({ canonical: "C", completed: false, rulesetId: "cm-2026", rulesetVersion: 1 }),
    );
    expect(await unfinished.service.recordDraft("u1", { snapshot: "x", aiSide: "dire" })).toEqual(
      err({ type: "not_completed" }),
    );
    const invalid = activitySetup(err({ type: "invalid_snapshot" }));
    expect(await invalid.service.recordDraft("u1", { snapshot: "x", aiSide: "dire" })).toEqual(
      err({ type: "invalid_snapshot" }),
    );
    expect(unfinished.repo.drafts).toHaveLength(0);
  });
});
