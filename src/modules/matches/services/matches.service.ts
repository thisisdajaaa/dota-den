import type { Logger } from "@/common/logging/logger";
import type { Result } from "@/common/result";
import type { DataOwner } from "@/common/privacy/user-data";
import type { MatchDetail } from "../domain/match-detail";
import type {
  DashboardFact,
  HeroInfo,
  ItemInfo,
  PlayerProfileSnapshot,
  ProviderError,
} from "../domain/read-models";
import type { OpenDotaMatchesSource } from "../matches.ports";
import { toFact } from "./match-sync.service";

/** What MatchesService needs from storage beyond the query port. */
export interface MatchesStore {
  statsByAccount(
    accountIds: readonly number[],
  ): Promise<Map<number, { matches: number; lastSyncAt: Date | null; backfillComplete: boolean }>>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>>;
  deleteForOwner(owner: DataOwner): Promise<Record<string, number>>;
}

/** Hero and item catalogs, public profiles and matches (OpenDota), and your imported data. */
export class MatchesService {
  constructor(
    private readonly deps: {
      openDota: OpenDotaMatchesSource;
      store: MatchesStore;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  /** Hero lookup by id. Empty when the catalog is unavailable (UI falls back to "Hero #id"). */
  async heroMap(): Promise<Map<number, HeroInfo>> {
    const res = await this.deps.openDota.getHeroes();
    if (!res.ok) this.deps.logger.warn("hero_catalog_unavailable", { reason: res.error.type });
    return new Map((res.ok ? res.value : []).map((h) => [h.id, h]));
  }

  /** Item lookup by id. Empty when unavailable (UI shows an empty slot with the id). */
  async itemMap(): Promise<Map<number, ItemInfo>> {
    const res = await this.deps.openDota.getItems();
    if (!res.ok) this.deps.logger.warn("item_catalog_unavailable", { reason: res.error.type });
    return new Map((res.ok ? res.value : []).map((i) => [i.id, i]));
  }

  /** Public profile (persona, avatar, rank) as a Result. */
  profile(accountId32: number): Promise<Result<PlayerProfileSnapshot, ProviderError>> {
    return this.deps.openDota.fetchPlayerProfile(accountId32);
  }

  /** Public profile, or null when the upstream can't provide it. */
  async playerProfile(accountId32: number): Promise<PlayerProfileSnapshot | null> {
    const res = await this.profile(accountId32);
    if (!res.ok)
      this.deps.logger.warn("profile_unavailable", { accountId32, reason: res.error.type });
    return res.ok ? res.value : null;
  }

  /** One match with every player (cached upstream; parsed matches include replay data). */
  match(matchId: string): Promise<Result<MatchDetail, ProviderError>> {
    return this.deps.openDota.fetchMatch(matchId);
  }

  /** Ask OpenDota to parse a match's replay (laning, item timings, wards). */
  requestParse(matchId: string): Promise<Result<true, ProviderError>> {
    return this.deps.openDota.requestParse(matchId);
  }

  /**
   * Any player's most recent public matches, straight from OpenDota (nothing stored), in the
   * same row shape as the dashboard so match lists can be shared. Cached briefly upstream.
   * With `includedAccountId`, only matches that account also played in (either team).
   */
  async publicRecentMatches(
    accountId32: number,
    limit = 20,
    opts: { includedAccountId?: number } = {},
  ): Promise<Result<DashboardFact[], ProviderError>> {
    const { openDota } = this.deps;
    const [page, timeline] = await Promise.all([
      openDota.fetchPlayerMatches(
        accountId32,
        { offset: 0, limit },
        { cacheTtlMs: 10 * 60 * 1000, includedAccountId: opts.includedAccountId },
      ),
      openDota.getTimeline(),
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
  statsByAccount(accountIds: readonly number[]) {
    return this.deps.store.statsByAccount(accountIds);
  }

  exportMyData(owner: DataOwner) {
    return this.deps.store.exportForOwner(owner);
  }

  deleteMyData(owner: DataOwner) {
    return this.deps.store.deleteForOwner(owner);
  }
}
