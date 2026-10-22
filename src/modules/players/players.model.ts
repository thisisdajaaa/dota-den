import type { PlayerFollow } from "./domain/follow";

export const PLAYERS_SCHEMA_VERSION = 1;
export const PLAYER_COLLECTIONS = {
  follows: "player_follows",
  profiles: "player_profiles",
} as const;

/** A public OpenDota profile as last fetched, shared by every page that lists players. */
export interface PlayerProfileDoc {
  /** The account id. */
  _id: number;
  personaName: string | null;
  avatarUrl: string | null;
  matchHistory: "full" | "limited" | "unknown";
  rankTier: number | null;
  leaderboardRank: number | null;
  fetchedAt: Date;
  /** Start of the latest public match (null: none listed), when it has been looked up. */
  lastMatchAt?: Date | null;
  lastMatchFetchedAt?: Date;
}

export interface FollowDoc extends PlayerFollow {
  schemaVersion: number;
}
