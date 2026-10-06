import type { PlayerFollow } from "../../domain/follow";

export interface FollowDto {
  accountId32: number;
  createdAt: string;
}

/** Never exposes the owner's user id. */
export function toFollowDto(f: PlayerFollow): FollowDto {
  return { accountId32: f.accountId32, createdAt: f.createdAt.toISOString() };
}

/** A row in the signed-in user's "Tracked players" list; public upstream data only. */
export interface TrackedPlayerView {
  accountId32: number;
  trackedAt: Date;
  /** null when the upstream couldn't be reached for this player right now. */
  personaName: string | null;
  avatarUrl: string | null;
  rankTier: number | null;
  leaderboardRank: number | null;
  lastMatchAt: Date | null;
}

export interface TrackedPlayersPage {
  items: TrackedPlayerView[];
  total: number;
  page: number;
  pageCount: number;
}
