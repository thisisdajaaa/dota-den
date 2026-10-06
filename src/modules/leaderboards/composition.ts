import "server-only";
import type { DataOwner } from "@/common/privacy/user-data";
import { createHash } from "node:crypto";
import { getDb } from "@/common/db/mongo";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import {
  decodeSnapshot,
  encodeSnapshot,
  replaySnapshot,
  snapshotOf,
} from "@/modules/drafts/application/snapshot";
import { getAiOpponent, getDraftHistoryService } from "@/modules/drafts/composition";
import { getCurrentUser, usersService } from "@/modules/identity";
import type { User } from "@/modules/identity/domain/user";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { err, ok } from "@/common/result";
import { ActivityService } from "./application/activity-service";
import { LeaderboardService } from "./application/leaderboard-service";
import type {
  AccountDirectory,
  DraftReferee,
  FriendFinder,
  PlayerAccount,
} from "./application/ports";
import type { RankedWeekView } from "./application/contracts";
import { MAX_RANKED_WEEK_FRIENDS, rankWeek } from "./domain/ranked-week";
import {
  MongoActivityRepository,
  activityCountsByUser,
} from "./infrastructure/mongo-activity-repository";
import { bestHeroThisWeek, rankedWeekFor } from "./infrastructure/opendota-ranked-week";
import * as userData from "./infrastructure/user-data";
import { followService, ownerOf, playerDirectory, playersService } from "@/modules/players";

/** OpenDota teammates considered as friends (most games on the same team first). */
const MAX_PEER_FRIENDS = 200;
/** Best heroes are looked up for this many rows at the top of "Ranked this week". */
const BEST_HERO_ROWS = 5;
/** Room captains you've drafted with, considered as friends. */
const MAX_ROOM_FRIENDS = 100;

/** Replays drafts with the drafts context's engine and asks its AI captain for the outlook. */
const referee: DraftReferee = {
  async replay(encoded) {
    const decoded = decodeSnapshot(encoded);
    if (!decoded.ok) return err({ type: "invalid_snapshot" });
    const pool = [...(await getHeroMap()).keys()];
    if (pool.length === 0) return err({ type: "heroes_unavailable" });
    const replayed = replaySnapshot(decoded.value, pool);
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    const state = replayed.value;
    return ok({
      canonical: encodeSnapshot(snapshotOf(state)),
      completed: state.status === "completed",
      rulesetId: state.rulesetId,
      rulesetVersion: state.rulesetVersion,
    });
  },
  async outlook(canonical) {
    const decoded = decodeSnapshot(canonical);
    if (!decoded.ok) return null;
    const res = await (await getAiOpponent()).outlook(decoded.value);
    return res.ok ? res.value : null;
  },
};

export async function getActivityService(): Promise<ActivityService> {
  return new ActivityService({
    repo: new MongoActivityRepository(await getDb()),
    referee,
    hash: (text) => createHash("sha256").update(text).digest("hex"),
    onScoreError: (error) => logger.warn("draft_score_failed", { error }),
  });
}

const toAccount = (u: User): PlayerAccount => ({
  userId: u.id,
  accountId32: u.accountId32,
  name: u.persona?.name ?? null,
  avatarUrl: u.persona?.avatarUrl ?? null,
});

const accounts: AccountDirectory = {
  byUserIds: async (ids) => (await usersService.findByIds(ids)).map(toAccount),
  byAccountIds: async (ids) => (await usersService.findByAccountIds(ids)).map(toAccount),
  publicUserIds: () => usersService.findPublicIds(env().LEADERBOARD_EVERYONE_MAX_PLAYERS),
};

/**
 * Friends: tracked players, OpenDota teammates and captains you've drafted with in rooms.
 * A source that fails is skipped (and reported), so the board still shows the rest.
 */
const friends: FriendFinder = {
  async friendAccountIds(viewer) {
    const user = { id: viewer.userId, accountId32: viewer.accountId32 };
    const [tracked, peers, rooms] = await Promise.allSettled([
      followService.list(ownerOf(user)),
      playerDirectory.peers(viewer.accountId32),
      getDraftHistoryService().then((s) => s.opponents(viewer.userId, MAX_ROOM_FRIENDS)),
    ]);
    let incomplete = false;
    const ids: number[] = [];
    if (tracked.status === "fulfilled") ids.push(...tracked.value.map((f) => f.accountId32));
    else {
      incomplete = true;
      logger.warn("leaderboard_friends_tracked_failed", { error: tracked.reason });
    }
    if (peers.status === "fulfilled" && peers.value.ok) {
      ids.push(
        ...peers.value.value
          .filter((p) => p.withGames > 0)
          .sort((a, b) => b.withGames - a.withGames)
          .slice(0, MAX_PEER_FRIENDS)
          .map((p) => p.accountId32),
      );
    } else {
      incomplete = true;
      logger.warn("leaderboard_friends_peers_failed", {
        reason:
          peers.status === "fulfilled" && !peers.value.ok ? peers.value.error.type : "exception",
      });
    }
    if (rooms.status === "fulfilled") ids.push(...rooms.value.map((o) => o.accountId32));
    else {
      incomplete = true;
      logger.warn("leaderboard_friends_rooms_failed", { error: rooms.reason });
    }
    return { accountIds: [...new Set(ids)], incomplete };
  },
};

/**
 * The signed-in viewer's saved challenge streak, or null for guests. An outage returns null
 * too, so the page falls back to this device's progress.
 */
export async function getViewerChallengeStreak(): Promise<{ streak: number; best: number } | null> {
  const user = await getCurrentUser({ tolerateErrors: true });
  if (!user) return null;
  try {
    const s = await (await getActivityService()).challengeStreak(user.id);
    return { streak: s.current, best: s.best };
  } catch (error) {
    logger.error("challenge_streak_lookup_failed", { error });
    return null;
  }
}

export async function getLeaderboardService(): Promise<LeaderboardService> {
  const db = await getDb();
  return new LeaderboardService({
    activity: new MongoActivityRepository(db),
    rooms: {
      totals: async (query) => (await getDraftHistoryService()).captainTotals(query),
    },
    accounts,
    profiles: {
      profile: async (accountId32) => {
        const p = await playersService.publicProfile(accountId32);
        return p
          ? {
              personaName: p.personaName,
              avatarUrl: p.avatarUrl,
              rankTier: p.rankTier,
              leaderboardRank: p.leaderboardRank,
            }
          : null;
      },
    },
    friends,
    rowLimit: env().LEADERBOARD_ROW_LIMIT,
  });
}

/** Admin overview: finished drafts and challenge answers per user. */
export async function getActivityCounts(userIds: readonly string[]) {
  return activityCountsByUser(await getDb(), userIds);
}

/** Ranked wins and losses this week for you and up to 15 friends (public OpenDota data). */
/** At most `limit` OpenDota calls in flight at once. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const RANKED_WEEK_CONCURRENCY = 4;

export async function getRankedWeek(viewer: {
  userId: string;
  accountId32: number;
}): Promise<RankedWeekView> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const found = await friends.friendAccountIds(viewer);
  const ids = [
    viewer.accountId32,
    ...found.accountIds.filter((id) => id !== viewer.accountId32).slice(0, MAX_RANKED_WEEK_FRIENDS),
  ];
  const opts = {
    baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
  };
  const inputs = await mapLimit(ids, RANKED_WEEK_CONCURRENCY, (id) =>
    rankedWeekFor(openDotaGateway(), opts, id).catch(() => null),
  );
  const known = inputs.filter((i): i is NonNullable<typeof i> => i !== null);
  const { rows, idle } = rankWeek(known);
  // OpenDota reports 0–0 for private match data too: only call it "didn't play" when the
  // profile says the history is fully public.
  const idleProfiles = await mapLimit(idle, RANKED_WEEK_CONCURRENCY, (id) =>
    playersService.publicProfile(id).catch(() => null),
  );
  const reallyIdle = idleProfiles.filter((p) => p?.matchHistory === "full").length;
  // Best heroes for the top of the board only: each is one more OpenDota call.
  const best = await mapLimit(rows.slice(0, BEST_HERO_ROWS), RANKED_WEEK_CONCURRENCY, (r) =>
    bestHeroThisWeek(openDotaGateway(), opts, r.accountId32).catch(() => null),
  );
  best.forEach((b, i) => (rows[i].bestHero = b));
  const profiles = await mapLimit(rows, RANKED_WEEK_CONCURRENCY, (r) =>
    playersService.publicProfile(r.accountId32).catch(() => null),
  );
  return {
    rows: rows.map((r, i) => ({
      ...r,
      name: profiles[i]?.personaName ?? null,
      avatarUrl: profiles[i]?.avatarUrl ?? null,
      you: r.accountId32 === viewer.accountId32,
    })),
    idle: reallyIdle,
    unknown: ids.length - known.length + (idle.length - reallyIdle),
    friendsIncomplete: found.incomplete,
  };
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
