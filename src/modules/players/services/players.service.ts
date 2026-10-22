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
import type {
  PlayerDirectory,
  ProfileSnapshotStore,
  ProviderError,
  SavedProfile,
} from "../players.ports";
import type { FollowService } from "./follow.service";

/** Tracked players rendered per page: one database read, upstream calls only to fill gaps. */
export const TRACKED_PAGE_SIZE = 20;

/** Other players' names, avatars and ranks in lists are refreshed this often. */
export const PROFILE_SNAPSHOT_MAX_AGE_MS = 6 * 3_600_000;
/** Tracked players' last-match times are looked up again after this long. */
export const LAST_MATCH_MAX_AGE_MS = 3_600_000;
/** New profile fetches at a time when filling a list. */
const PROFILE_CONCURRENCY = 4;

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
      /** Optional: without it every lookup goes to OpenDota (through the gateway's cache). */
      snapshots?: ProfileSnapshotStore;
      /**
       * Runs a task after the response is sent (`after` from next/server). With it, old saved
       * copies are shown at once and refreshed for the next visit; without it, they're
       * refreshed before returning.
       */
      defer?: (task: () => Promise<void>) => void;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
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

  /**
   * A player's public profile for showing them in a list or header: a saved copy up to
   * PROFILE_SNAPSHOT_MAX_AGE_MS old, else fetched (and saved). When OpenDota fails, an older
   * saved copy is better than nothing.
   */
  async publicProfile(accountId32: number): Promise<PlayerProfileSnapshot | null> {
    return (await this.publicProfiles([accountId32])).get(accountId32) ?? null;
  }

  /**
   * Many profiles at once: one database read, then OpenDota only for missing ones (and old
   * ones, after the response when it can be deferred).
   */
  async publicProfiles(
    accountIds: readonly number[],
  ): Promise<Map<number, PlayerProfileSnapshot | null>> {
    const ids = [...new Set(accountIds)];
    const now = this.deps.now?.() ?? new Date();
    return this.resolveProfiles(ids, await this.saved(ids), now);
  }

  private async saved(ids: readonly number[]): Promise<Map<number, SavedProfile>> {
    if (!this.deps.snapshots || ids.length === 0) return new Map();
    return this.deps.snapshots.getMany(ids).catch(() => new Map<number, SavedProfile>());
  }

  /** Runs `task` after the response; failures are logged, never thrown. */
  private later(event: string, task: () => Promise<unknown>): void {
    this.deps.defer?.(() =>
      task().then(
        () => {},
        (e: unknown) => this.deps.logger.warn(event, { error: e }),
      ),
    );
  }

  private async resolveProfiles(
    ids: readonly number[],
    saved: Map<number, SavedProfile>,
    now: Date,
  ): Promise<Map<number, PlayerProfileSnapshot | null>> {
    const profiles = new Map<number, PlayerProfileSnapshot>(
      [...saved].map(([id, { fetchedAt: _at, lastMatch: _last, ...p }]) => [id, p]),
    );
    const missing = ids.filter((id) => !saved.has(id));
    const old = ids.filter((id) => {
      const s = saved.get(id);
      return (
        s !== undefined && now.getTime() - s.fetchedAt.getTime() >= PROFILE_SNAPSHOT_MAX_AGE_MS
      );
    });
    // Missing: wait (there's nothing to show). Old: show the saved copy now and refresh it
    // after the response when possible. A failed fetch keeps the old copy.
    const deferOld = this.deps.defer !== undefined;
    if (deferOld && old.length > 0)
      this.later("player_profile_refresh_failed", () => this.fetchProfiles(old, now));
    const fetched = await this.fetchProfiles(deferOld ? missing : [...missing, ...old], now);
    for (const [id, p] of fetched) profiles.set(id, p);
    return new Map(
      ids.map((id) => {
        const p = profiles.get(id);
        return [id, p ? { ...p, avatarUrl: this.deps.safeAvatar(p.avatarUrl) } : null];
      }),
    );
  }

  /** Fetches and saves profiles; the ones OpenDota returned. */
  private async fetchProfiles(
    ids: readonly number[],
    now: Date,
  ): Promise<Map<number, PlayerProfileSnapshot>> {
    const out = new Map<number, PlayerProfileSnapshot>();
    await mapLimit(ids, PROFILE_CONCURRENCY, async (id) => {
      const res = await this.deps.profiles.fetchPlayerProfile(id);
      if (!res.ok) {
        this.warnOnError("player_profile_failed", { accountId32: id }, res);
        return;
      }
      out.set(id, res.value);
      await this.deps.snapshots?.save(res.value, now).catch(() => {});
    });
    return out;
  }

  /** Looks up and saves last-match times; the ones OpenDota returned. */
  private async fetchLastMatches(
    ids: readonly number[],
    now: Date,
  ): Promise<Map<number, Date | null>> {
    const out = new Map<number, Date | null>();
    await mapLimit(ids, PROFILE_CONCURRENCY, async (id) => {
      const res = await this.deps.directory.lastMatchAt(id);
      if (!res.ok) {
        this.warnOnError("player_last_match_failed", { accountId32: id }, res);
        return;
      }
      out.set(id, res.value);
      await this.deps.snapshots?.saveLastMatch(id, res.value, now).catch(() => {});
    });
    return out;
  }

  /**
   * The owner's tracked players, newest first, for one page: saved profiles and last-match
   * times (one database read). Only players never saved wait on OpenDota; old details are
   * refreshed after the response.
   */
  async trackedPlayers(owner: FollowOwner, page = 1): Promise<TrackedPlayersPage> {
    const follows = await this.deps.follows.list(owner);
    const pageCount = Math.max(1, Math.ceil(follows.length / TRACKED_PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pageCount);
    const slice = follows.slice((current - 1) * TRACKED_PAGE_SIZE, current * TRACKED_PAGE_SIZE);
    const now = this.deps.now?.() ?? new Date();
    const ids = slice.map((f) => f.accountId32);
    const saved = await this.saved(ids);
    const profiles = await this.resolveProfiles(ids, saved, now);

    // undefined: never looked up (shown as nothing rather than "no recent matches").
    const lastMatches = new Map<number, Date | null | undefined>(
      ids.map((id) => [id, saved.get(id)?.lastMatch?.at]),
    );
    const old = ids.filter((id) => {
      const at = saved.get(id)?.lastMatch?.fetchedAt;
      return !at || now.getTime() - at.getTime() >= LAST_MATCH_MAX_AGE_MS;
    });
    if (!this.deps.defer)
      for (const [id, at] of await this.fetchLastMatches(old, now)) lastMatches.set(id, at);
    else if (old.length > 0)
      this.later("player_last_match_refresh_failed", () => this.fetchLastMatches(old, now));

    const items = slice.map((f) => {
      const p = profiles.get(f.accountId32) ?? null;
      return {
        accountId32: f.accountId32,
        trackedAt: f.createdAt,
        personaName: p?.personaName ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        rankTier: p?.rankTier ?? null,
        leaderboardRank: p?.leaderboardRank ?? null,
        lastMatchAt: lastMatches.get(f.accountId32),
      };
    });
    return { items, total: follows.length, page: current, pageCount };
  }
}
