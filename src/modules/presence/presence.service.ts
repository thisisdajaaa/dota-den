import type { Logger } from "@/common/logging/logger";
import { mapLimit } from "@/common/utils/map-limit";
import {
  parseAccountId32,
  parseSteamId64,
  toAccountId32,
  toSteamId64,
} from "@/modules/identity/domain/steam-id";
import {
  batches,
  isPlayingDota,
  MAX_CANDIDATES,
  MAX_FALLBACK_TEAMMATES,
  MIN_TEAMMATE_GAMES,
  playingStatus,
  sortPlaying,
  type PlayingFriend,
} from "./domain/presence";
import {
  DISABLED,
  toPlayingFriendDto,
  type FriendSource,
  type FriendsPlayingDto,
} from "./dtos/responses/friends-playing.dto";
import type { KnownPlayers, LiveMatchFinder, SteamPresenceSource } from "./presence.ports";

export interface Viewer {
  userId: string;
  accountId32: number;
  steamId64: string;
}

/**
 * Friends playing Dota 2 right now, from Steam's public presence. Whose presence: your Steam
 * friends when your friend list is public (plus players you track); otherwise players you
 * track and your frequent teammates. Off (DISABLED) without a Steam Web API key.
 */
export class PresenceService {
  constructor(
    private readonly deps: {
      /** Null when STEAM_WEB_API_KEY is unset. */
      steam: SteamPresenceSource | null;
      known: KnownPlayers;
      live: LiveMatchFinder;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  async playingNow(viewer: Viewer): Promise<FriendsPlayingDto> {
    const steam = this.deps.steam;
    if (!steam) return DISABLED;

    const { source, steamIds } = await this.candidates(steam, viewer);
    const lists = await mapLimit(batches(steamIds), 3, (ids) =>
      steam.summaries(ids).catch(() => null),
    );
    if (lists.some((l) => l === null))
      this.deps.logger.warn("presence_summaries_failed", {
        failed: lists.filter((l) => !l).length,
      });
    // Only the friends we asked about, once each, and only what Steam says publicly.
    const asked = new Set(steamIds);
    const seen = new Set<string>();
    const playing = lists
      .flatMap((l) => l ?? [])
      .filter((p) => asked.has(p.steamId64) && !seen.has(p.steamId64) && seen.add(p.steamId64))
      .filter(isPlayingDota)
      .flatMap((p) => {
        const id = parseSteamId64(p.steamId64);
        return id.ok ? [{ presence: p, accountId32: toAccountId32(id.value) as number }] : [];
      });
    if (playing.length === 0) return { enabled: true, source, friends: [] };

    const accounts = playing.map((p) => p.accountId32);
    const live = await this.deps.live.liveMatchIds(accounts).catch((error: unknown) => {
      this.deps.logger.warn("presence_live_lookup_failed", { error });
      return new Map<number, string>();
    });
    const friends = playing.map(({ presence: p, accountId32 }): PlayingFriend => {
      const liveMatchId = live.get(accountId32) ?? null;
      return {
        accountId32,
        steamId64: p.steamId64,
        name: p.name,
        avatarUrl: p.avatarUrl,
        status: playingStatus(p, liveMatchId),
        liveMatchId,
      };
    });
    return { enabled: true, source, friends: sortPlaying(friends).map(toPlayingFriendDto) };
  }

  /** SteamID64s to check (never yourself), capped; and where they came from. */
  private async candidates(
    steam: SteamPresenceSource,
    viewer: Viewer,
  ): Promise<{ source: FriendSource; steamIds: string[] }> {
    const [list, tracked] = await Promise.all([
      steam.friendList(viewer.steamId64).catch(() => ({ kind: "unavailable" }) as const),
      this.deps.known
        .tracked({ userId: viewer.userId, accountId32: viewer.accountId32 })
        .catch((error: unknown) => {
          this.deps.logger.warn("presence_tracked_failed", { error });
          return [];
        }),
    ]);
    const trackedIds = tracked.map((t) => t.accountId32);

    let source: FriendSource;
    let ids: string[];
    if (list.kind === "public") {
      source = "steam_friends";
      ids = [...trackedIds.flatMap(steamIdOf), ...list.steamIds];
    } else {
      source = "tracked_and_teammates";
      const teammates = await this.deps.known
        .teammates(viewer.accountId32)
        .catch(() => null)
        .then((rows) => {
          if (!rows) this.deps.logger.warn("presence_teammates_failed", {});
          return rows ?? [];
        });
      const frequent = teammates
        .filter((t) => t.withGames >= MIN_TEAMMATE_GAMES)
        .sort((a, b) => b.withGames - a.withGames)
        .slice(0, MAX_FALLBACK_TEAMMATES)
        .map((t) => t.accountId32);
      ids = [...trackedIds, ...frequent].flatMap(steamIdOf);
    }
    const valid = ids.filter((id) => parseSteamId64(id).ok && id !== viewer.steamId64);
    return { source, steamIds: [...new Set(valid)].slice(0, MAX_CANDIDATES) };
  }
}

function steamIdOf(accountId32: number): string[] {
  const parsed = parseAccountId32(accountId32);
  return parsed.ok && parsed.value > 0 ? [toSteamId64(parsed.value)] : [];
}
