import "server-only";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type {
  DashboardFact,
  PlayerProfileSnapshot,
  ProviderError as MatchProviderError,
} from "@/modules/matches/application/ports";
import {
  getOpenDotaAdapter,
  getPublicRecentMatches,
  openDotaGateway,
} from "@/modules/matches/composition";
import type { Result } from "@/modules/shared/domain/result";
import type { TrackedPlayersPage } from "./application/contracts";
import { FollowService, type FollowOwner } from "./application/follow-service";
import type { PlayerDirectory, ProviderError } from "./application/ports";
import type { HeroUsage, Peer, PlayerSearchHit, WinLoss } from "./domain/public-player";
import { MongoFollowRepository } from "./infrastructure/mongo-follow-repository";
import { OpenDotaPlayerDirectory, steamAvatar } from "./infrastructure/opendota-player-directory";

/** Tracked players rendered per page: each costs up to two (cached) upstream calls. */
export const TRACKED_PAGE_SIZE = 20;

export function getPlayerDirectory(): PlayerDirectory {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  // The shared OpenDota gateway: one cache, dedup and circuit breaker for the whole app.
  return new OpenDotaPlayerDirectory(openDotaGateway(), {
    apiKey: OPENDOTA_API_KEY,
    baseUrl: OPENDOTA_BASE_URL,
  });
}

export async function getFollowService(): Promise<FollowService> {
  return new FollowService(new MongoFollowRepository(await getDb()));
}

function warnOnError<T, E extends { type: string }>(
  event: string,
  ctx: Record<string, unknown>,
  res: Result<T, E>,
): Result<T, E> {
  if (!res.ok && res.error.type !== "not_found")
    logger.warn(event, { ...ctx, reason: res.error.type });
  return res;
}

export async function searchPlayers(q: string): Promise<Result<PlayerSearchHit[], ProviderError>> {
  return warnOnError("player_search_failed", {}, await getPlayerDirectory().search(q));
}

export interface PublicPlayerView {
  profile: Result<PlayerProfileSnapshot, MatchProviderError>;
  record: Result<WinLoss, ProviderError>;
  heroes: Result<HeroUsage[], ProviderError>;
  peers: Result<Peer[], ProviderError>;
  matches: Result<DashboardFact[], MatchProviderError>;
}

/**
 * Everything on a public profile, fetched in parallel. Each section fails on its own so a
 * slow or broken endpoint only blanks its own card. Public OpenDota data only: nothing from
 * our database about other users is ever read here.
 */
export async function getPublicPlayer(accountId32: number): Promise<PublicPlayerView> {
  const directory = getPlayerDirectory();
  const ctx = { accountId32 };
  const [profile, record, heroes, peers, matches] = await Promise.all([
    getOpenDotaAdapter().fetchPlayerProfile(accountId32),
    directory.winLoss(accountId32),
    directory.heroes(accountId32),
    directory.peers(accountId32),
    getPublicRecentMatches(accountId32, 20),
  ]);
  return {
    // Other players' avatars are only rendered from Steam's CDN.
    profile: warnOnError(
      "player_profile_failed",
      ctx,
      profile.ok
        ? {
            ...profile,
            value: { ...profile.value, avatarUrl: steamAvatar(profile.value.avatarUrl) },
          }
        : profile,
    ),
    record: warnOnError("player_wl_failed", ctx, record),
    heroes: warnOnError("player_heroes_failed", ctx, heroes),
    peers: warnOnError("player_peers_failed", ctx, peers),
    matches: warnOnError("player_matches_failed", ctx, matches),
  };
}

/** Run `fn` over `items` with at most `limit` in flight (be gentle with the upstream). */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The owner's tracked players, newest first, with live public details for one page. */
export async function getTrackedPlayers(owner: FollowOwner, page = 1): Promise<TrackedPlayersPage> {
  const follows = await (await getFollowService()).list(owner);
  const pageCount = Math.max(1, Math.ceil(follows.length / TRACKED_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const slice = follows.slice((current - 1) * TRACKED_PAGE_SIZE, current * TRACKED_PAGE_SIZE);
  const directory = getPlayerDirectory();
  const adapter = getOpenDotaAdapter();

  const items = await mapLimit(slice, 4, async (f) => {
    const [profile, last] = await Promise.all([
      adapter.fetchPlayerProfile(f.accountId32),
      directory.lastMatchAt(f.accountId32),
    ]);
    const p = profile.ok ? profile.value : null;
    return {
      accountId32: f.accountId32,
      trackedAt: f.createdAt,
      personaName: p?.personaName ?? null,
      avatarUrl: steamAvatar(p?.avatarUrl),
      rankTier: p?.rankTier ?? null,
      leaderboardRank: p?.leaderboardRank ?? null,
      lastMatchAt: last.ok ? last.value : null,
    };
  });
  return { items, total: follows.length, page: current, pageCount };
}
