import "server-only";
import type { DataOwner } from "@/common/privacy/user-data";
import { getDb } from "@/common/db/mongo";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { openDotaGateway } from "@/common/providers/opendota";
import { MatchSyncService, toFact } from "./application/match-sync-service";
import type {
  DashboardFact,
  HeroInfo,
  ItemInfo,
  MatchQueries,
  PlayerProfileSnapshot,
  ProviderError,
} from "./application/ports";
import type { Result } from "@/common/result";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import {
  MongoMatchQueries,
  MongoPlayerMatchFactRepository,
  MongoSyncStateRepository,
  matchStatsByAccount,
} from "./infrastructure/mongo-match-repositories";
import * as userData from "./infrastructure/user-data";

export { openDotaGateway } from "@/common/providers/opendota";

export function getOpenDotaAdapter(): OpenDotaAdapter {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new OpenDotaAdapter(openDotaGateway(), {
    apiKey: OPENDOTA_API_KEY,
    baseUrl: OPENDOTA_BASE_URL,
  });
}

export async function getMatchSyncService(): Promise<MatchSyncService> {
  const db = await getDb();
  const openDota = getOpenDotaAdapter();
  return new MatchSyncService({
    provider: openDota,
    patches: openDota,
    facts: new MongoPlayerMatchFactRepository(db),
    syncState: new MongoSyncStateRepository(db),
  });
}

export async function getMatchQueries(): Promise<MatchQueries> {
  return new MongoMatchQueries(await getDb());
}

/** Public profile (persona, avatar, rank). Tolerates upstream failure: returns null. */
export async function getPlayerProfile(accountId32: number): Promise<PlayerProfileSnapshot | null> {
  const res = await getOpenDotaAdapter().fetchPlayerProfile(accountId32);
  if (!res.ok) logger.warn("profile_unavailable", { accountId32, reason: res.error.type });
  return res.ok ? res.value : null;
}

/** Hero lookup by id. Empty map if the catalog is unavailable (UI falls back to "Hero #id"). */
export async function getHeroMap(): Promise<Map<number, HeroInfo>> {
  const res = await getOpenDotaAdapter().getHeroes();
  if (!res.ok) logger.warn("hero_catalog_unavailable", { reason: res.error.type });
  return new Map((res.ok ? res.value : []).map((h) => [h.id, h]));
}

/** Item lookup by id. Empty map if unavailable (UI shows an empty slot with the id). */
export async function getItemMap(): Promise<Map<number, ItemInfo>> {
  const res = await getOpenDotaAdapter().getItems();
  if (!res.ok) logger.warn("item_catalog_unavailable", { reason: res.error.type });
  return new Map((res.ok ? res.value : []).map((i) => [i.id, i]));
}

/**
 * Any player's most recent public matches, straight from OpenDota (nothing stored), in the
 * same row shape as the dashboard so match lists can be shared. Cached briefly upstream.
 * With `includedAccountId`, only matches that account also played in (either team).
 */
export async function getPublicRecentMatches(
  accountId32: number,
  limit = 20,
  opts: { includedAccountId?: number } = {},
): Promise<Result<DashboardFact[], ProviderError>> {
  const adapter = getOpenDotaAdapter();
  const [page, timeline] = await Promise.all([
    adapter.fetchPlayerMatches(
      accountId32,
      { offset: 0, limit },
      { cacheTtlMs: 10 * 60 * 1000, includedAccountId: opts.includedAccountId },
    ),
    adapter.getTimeline(),
  ]);
  if (!page.ok) return page;
  // Without the patch timeline, rows just show no patch; never guess one.
  const patches = timeline.ok ? timeline.value : [];
  return {
    ok: true,
    value: page.value.matches.map((m) => {
      const f = toFact(m, patches);
      return {
        matchId: f.matchId,
        startedAt: f.startedAt,
        durationSec: f.durationSec,
        heroId: f.heroId,
        side: f.side,
        result: f.result,
        kills: f.kills,
        deaths: f.deaths,
        assists: f.assists,
        ranked: f.ranked,
        queueClass: f.queue.queueClass,
        partySize: f.queue.partySize,
        patch: f.patch.patch,
        patchCertainty: f.patch.certainty,
      };
    }),
  };
}

/** Admin overview: imported matches and sync state per account. */
export async function getMatchStatsByAccount(accountIds: readonly number[]) {
  return matchStatsByAccount(await getDb(), accountIds);
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
