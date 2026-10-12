import type { SteamPresence } from "./domain/presence";

/** A Steam friend list: public (SteamID64 strings), private, or not reachable right now. */
export type FriendList =
  { kind: "public"; steamIds: string[] } | { kind: "private" } | { kind: "unavailable" };

/** Steam's public presence (ISteamUser). */
export interface SteamPresenceSource {
  /** Friends of a SteamID64 (GetFriendList). */
  friendList(steamId64: string): Promise<FriendList>;
  /**
   * Presence of up to 100 SteamIDs (GetPlayerSummaries). Only the profiles Steam returns;
   * null when Steam is unavailable.
   */
  summaries(steamIds: readonly string[]): Promise<SteamPresence[] | null>;
}

/** The app's own idea of your friends, used when the Steam friend list is private. */
export interface KnownPlayers {
  /** Players you track (follows). */
  tracked(viewer: { userId: string; accountId32: number }): Promise<Array<{ accountId32: number }>>;
  /** OpenDota teammates with games on the same team; null when unavailable. */
  teammates(accountId32: number): Promise<Array<{ accountId32: number; withGames: number }> | null>;
}

/** Live games (OpenDota's live feed) that these accounts are in: account → match id. */
export interface LiveMatchFinder {
  liveMatchIds(accountIds: readonly number[]): Promise<Map<number, string>>;
}
