import type { PlayerFollow } from "./domain/follow";

export const PLAYERS_SCHEMA_VERSION = 1;
export const PLAYER_COLLECTIONS = { follows: "player_follows" } as const;

export interface FollowDoc extends PlayerFollow {
  schemaVersion: number;
}
