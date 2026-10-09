import { friendHref, type PlayingFriend, type PlayingStatus } from "../../domain/presence";

/** Whose presence was checked: your Steam friends, or (friend list private) people you know here. */
export type FriendSource = "steam_friends" | "tracked_and_teammates";

export interface PlayingFriendDto {
  accountId32: number;
  name: string | null;
  avatarUrl: string | null;
  status: PlayingStatus;
  /** The live game page when the account is in OpenDota's live feed, else the profile. */
  href: string;
  live: boolean;
}

/** GET /api/v1/me/friends/playing. `enabled` is false when Steam isn't configured. */
export interface FriendsPlayingDto {
  enabled: boolean;
  source: FriendSource | null;
  friends: PlayingFriendDto[];
}

export const DISABLED: FriendsPlayingDto = { enabled: false, source: null, friends: [] };

export function toPlayingFriendDto(f: PlayingFriend): PlayingFriendDto {
  return {
    accountId32: f.accountId32,
    name: f.name,
    avatarUrl: f.avatarUrl,
    status: f.status,
    href: friendHref(f),
    live: f.liveMatchId !== null,
  };
}
