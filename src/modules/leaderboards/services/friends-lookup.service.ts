import type { Logger } from "@/common/logging/logger";
import type { Result } from "@/common/result";
import type { FriendFinder } from "../leaderboards.ports";

/** OpenDota teammates considered as friends (most games on the same team first). */
const MAX_PEER_FRIENDS = 200;
/** Room captains you've drafted with, considered as friends. */
const MAX_ROOM_FRIENDS = 100;

/**
 * Friends: tracked players, OpenDota teammates and captains you've drafted with in rooms.
 * A source that fails is skipped (and reported), so boards still show the rest.
 */
export class FriendsLookupService implements FriendFinder {
  constructor(
    private readonly deps: {
      tracked(owner: {
        userId: string;
        accountId32: number;
      }): Promise<Array<{ accountId32: number }>>;
      peers(
        accountId32: number,
      ): Promise<Result<Array<{ accountId32: number; withGames: number }>, { type: string }>>;
      roomOpponents(userId: string, limit: number): Promise<Array<{ accountId32: number }>>;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  async friendAccountIds(viewer: { userId: string; accountId32: number }) {
    const { logger } = this.deps;
    const [tracked, peers, rooms] = await Promise.allSettled([
      this.deps.tracked(viewer),
      this.deps.peers(viewer.accountId32),
      this.deps.roomOpponents(viewer.userId, MAX_ROOM_FRIENDS),
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
  }
}
