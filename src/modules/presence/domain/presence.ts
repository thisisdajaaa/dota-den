/**
 * Friends playing now (pure): what Steam's public presence lets us say about a friend.
 * Nothing here guesses. A private profile, an offline friend or another game shows nothing,
 * and "in a match" needs a reliable signal (a game server, or the account in the live feed).
 */

/** Dota 2's Steam app id, as GetPlayerSummaries reports it (`gameid`, a string). */
export const DOTA_APP_ID = "570";
/** Steam's `communityvisibilitystate` for a public profile. */
export const PUBLIC_PROFILE = 3;
/** GetPlayerSummaries takes at most 100 SteamIDs per call. */
export const SUMMARIES_BATCH = 100;
/** Friends whose presence is checked per refresh (at most 3 summary calls). */
export const MAX_CANDIDATES = 300;
/** Frequent teammates used when the Steam friend list is private. */
export const MAX_FALLBACK_TEAMMATES = 50;
/** Games on the same team before an OpenDota teammate counts as a frequent one. */
export const MIN_TEAMMATE_GAMES = 3;
/** How often the overview strip refreshes while the tab is visible. */
export const REFRESH_SECONDS = 60;

/** One player's public Steam presence, as GetPlayerSummaries reports it (validated). */
export interface SteamPresence {
  steamId64: string;
  /** 1 private, 2 friends only, 3 public. */
  visibility: number;
  /** 0 offline, 1 online, 2 busy, 3 away, 4 snooze, 5 looking to trade, 6 looking to play. */
  personaState: number;
  name: string | null;
  avatarUrl: string | null;
  gameId: string | null;
  gameServerSteamId: string | null;
}

export type PlayingStatus = "in_match" | "in_game";

/** Where a friend's presence leads: their live game when we know it, else their profile. */
export interface PlayingFriend {
  accountId32: number;
  steamId64: string;
  name: string | null;
  avatarUrl: string | null;
  status: PlayingStatus;
  liveMatchId: string | null;
}

/** A real (non-zero) SteamID from a presence field; Steam sends "0" or nothing otherwise. */
export function meaningfulSteamId(value: string | null | undefined): string | null {
  return value && /^[1-9]\d*$/.test(value) ? value : null;
}

/** In Dota 2, per public presence only: public profile, not offline, game 570. */
export function isPlayingDota(p: SteamPresence): boolean {
  return p.visibility === PUBLIC_PROFILE && p.personaState !== 0 && p.gameId === DOTA_APP_ID;
}

/**
 * "In a match" only with a reliable signal: the account is in a live game we can link to, or
 * Steam reports the game server it's connected to. Otherwise just "playing Dota 2" (menus,
 * queue, party lobby or a match we can't see: we don't know which, so we don't say).
 */
export function playingStatus(p: SteamPresence, liveMatchId: string | null): PlayingStatus {
  return liveMatchId !== null || meaningfulSteamId(p.gameServerSteamId) !== null
    ? "in_match"
    : "in_game";
}

/** Link target for a friend in the strip. */
export function friendHref(f: Pick<PlayingFriend, "accountId32" | "liveMatchId">): string {
  return f.liveMatchId ? `/live/${f.liveMatchId}` : `/players/${f.accountId32}`;
}

/** Split ids into batches (sorted, so the same friends give the same cached requests). */
export function batches(ids: readonly string[], size = SUMMARIES_BATCH): string[][] {
  const sorted = [...new Set(ids)].sort();
  const out: string[][] = [];
  for (let i = 0; i < sorted.length; i += size) out.push(sorted.slice(i, i + size));
  return out;
}

/** In a match first, then by name (case-insensitive), then by account. */
export function sortPlaying(friends: readonly PlayingFriend[]): PlayingFriend[] {
  const rank = (s: PlayingStatus) => (s === "in_match" ? 0 : 1);
  return [...friends].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) ||
      a.accountId32 - b.accountId32,
  );
}
