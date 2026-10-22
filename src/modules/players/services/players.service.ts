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

/** The same sections, each still loading. */
export type PublicPlayerSections = { [K in keyof PublicPlayerView]: Promise<PublicPlayerView[K]> };

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

  /** A section's result, logged when it failed; a thrown error becomes "unavailable". */
  private settle<T, E extends { type: string }>(
    event: string,
    ctx: Record<string, unknown>,
    p: Promise<Result<T, E>>,
  ): Promise<Result<T, E | { type: "unavailable"; cause: string }>> {
    return p.then(
      (res) => this.warnOnError(event, ctx, res),
      (e: unknown) => {
        this.deps.logger.warn(event, { ...ctx, reason: "error", error: e });
        return { ok: false, error: { type: "unavailable", cause: "error" } };
      },
    );
  }

  /**
   * Everything on a public profile, all started at once, each section on its own promise so
   * a page can show what's ready and stream in the rest: a slow or broken endpoint only holds
   * back (or blanks) its own card. The promises never reject. Public OpenDota data only:
   * nothing from our database about other users is ever read here.
   */
  publicPlayerSections(accountId32: number): PublicPlayerSections {
    const { directory, profiles } = this.deps;
    const ctx = { accountId32 };
    return {
      profile: this.settle(
        "player_profile_failed",
        ctx,
        profiles.fetchPlayerProfile(accountId32).then((res) =>
          res.ok
            ? {
                ...res,
                value: { ...res.value, avatarUrl: this.deps.safeAvatar(res.value.avatarUrl) },
              }
            : res,
        ),
      ),
      record: this.settle("player_wl_failed", ctx, directory.winLoss(accountId32)),
      heroes: this.settle("player_heroes_failed", ctx, directory.heroes(accountId32)),
      peers: this.settle("player_peers_failed", ctx, directory.peers(accountId32)),
      matches: this.settle("player_matches_failed", ctx, profiles.recentMatches(accountId32, 20)),
    };
  }

  /** Everything on a public profile, once every section has answered (see above). */
  async publicPlayer(accountId32: number): Promise<PublicPlayerView> {
    const s = this.publicPlayerSections(accountId32);
    const [profile, record, heroes, peers, matches] = await Promise.all([
      s.profile,
      s.record,
      s.heroes,
      s.peers,
      s.matches,
    ]);
    return { profile, record, heroes, peers, matches };
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
