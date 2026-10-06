import type { Logger } from "@/common/logging/logger";
import type { Result } from "@/common/result";
import { mapLimit } from "@/common/utils/map-limit";
import type {
  DashboardFact,
  PlayerProfileSnapshot,
  ProviderError as MatchProviderError,
} from "@/modules/matches/domain/read-models";
import type { HeroUsage, Peer, PlayerSearchHit, WinLoss } from "../domain/public-player";
import type { TrackedPlayersPage } from "../dtos/responses/follows.dto";
import type { FollowOwner } from "../dtos/responses/players.dto";
import type { PlayerDirectory, ProviderError } from "../players.ports";
import type { FollowService } from "./follow.service";

/** Tracked players rendered per page: each costs up to two (cached) upstream calls. */
export const TRACKED_PAGE_SIZE = 20;

/** Profiles and recent matches come from the matches feature's OpenDota adapter. */
export interface PlayerProfileSource {
  fetchPlayerProfile(
    accountId32: number,
  ): Promise<Result<PlayerProfileSnapshot, MatchProviderError>>;
  recentMatches(
    accountId32: number,
    limit: number,
  ): Promise<Result<DashboardFact[], MatchProviderError>>;
}

export interface PublicPlayerView {
  profile: Result<PlayerProfileSnapshot, MatchProviderError>;
  record: Result<WinLoss, ProviderError>;
  heroes: Result<HeroUsage[], ProviderError>;
  peers: Result<Peer[], ProviderError>;
  matches: Result<DashboardFact[], MatchProviderError>;
}

/** Public player lookups (OpenDota data only) and your tracked players. */
export class PlayersService {
  constructor(
    private readonly deps: {
      directory: PlayerDirectory;
      profiles: PlayerProfileSource;
      follows: FollowService;
      /** Only Steam's CDN is allowed for other players' avatars. */
      safeAvatar: (url: string | null | undefined) => string | null;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  private warnOnError<T, E extends { type: string }>(
    event: string,
    ctx: Record<string, unknown>,
    res: Result<T, E>,
  ): Result<T, E> {
    if (!res.ok && res.error.type !== "not_found")
      this.deps.logger.warn(event, { ...ctx, reason: res.error.type });
    return res;
  }

  async search(q: string): Promise<Result<PlayerSearchHit[], ProviderError>> {
    return this.warnOnError("player_search_failed", {}, await this.deps.directory.search(q));
  }

  /**
   * Everything on a public profile, fetched in parallel. Each section fails on its own so a
   * slow or broken endpoint only blanks its own card. Public OpenDota data only: nothing from
   * our database about other users is ever read here.
   */
  async publicPlayer(accountId32: number): Promise<PublicPlayerView> {
    const { directory, profiles } = this.deps;
    const ctx = { accountId32 };
    const [profile, record, heroes, peers, matches] = await Promise.all([
      profiles.fetchPlayerProfile(accountId32),
      directory.winLoss(accountId32),
      directory.heroes(accountId32),
      directory.peers(accountId32),
      profiles.recentMatches(accountId32, 20),
    ]);
    return {
      profile: this.warnOnError(
        "player_profile_failed",
        ctx,
        profile.ok
          ? {
              ...profile,
              value: { ...profile.value, avatarUrl: this.deps.safeAvatar(profile.value.avatarUrl) },
            }
          : profile,
      ),
      record: this.warnOnError("player_wl_failed", ctx, record),
      heroes: this.warnOnError("player_heroes_failed", ctx, heroes),
      peers: this.warnOnError("player_peers_failed", ctx, peers),
      matches: this.warnOnError("player_matches_failed", ctx, matches),
    };
  }

  /** Any player's public name, avatar and rank (cached upstream); null when unavailable. */
  async publicProfile(accountId32: number): Promise<PlayerProfileSnapshot | null> {
    const res = await this.deps.profiles.fetchPlayerProfile(accountId32);
    if (!res.ok) {
      this.warnOnError("player_profile_failed", { accountId32 }, res);
      return null;
    }
    return { ...res.value, avatarUrl: this.deps.safeAvatar(res.value.avatarUrl) };
  }

  /** The owner's tracked players, newest first, with live public details for one page. */
  async trackedPlayers(owner: FollowOwner, page = 1): Promise<TrackedPlayersPage> {
    const follows = await this.deps.follows.list(owner);
    const pageCount = Math.max(1, Math.ceil(follows.length / TRACKED_PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pageCount);
    const slice = follows.slice((current - 1) * TRACKED_PAGE_SIZE, current * TRACKED_PAGE_SIZE);
    const items = await mapLimit(slice, 4, async (f) => {
      const [profile, last] = await Promise.all([
        this.deps.profiles.fetchPlayerProfile(f.accountId32),
        this.deps.directory.lastMatchAt(f.accountId32),
      ]);
      const p = profile.ok ? profile.value : null;
      return {
        accountId32: f.accountId32,
        trackedAt: f.createdAt,
        personaName: p?.personaName ?? null,
        avatarUrl: this.deps.safeAvatar(p?.avatarUrl),
        rankTier: p?.rankTier ?? null,
        leaderboardRank: p?.leaderboardRank ?? null,
        lastMatchAt: last.ok ? last.value : null,
      };
    });
    return { items, total: follows.length, page: current, pageCount };
  }
}
