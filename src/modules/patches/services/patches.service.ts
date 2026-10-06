import type { Logger } from "@/common/logging/logger";
import { COHORT_WINDOW_MS, patchDigest, type PatchDigest } from "../domain/digest";
import { diffSummary } from "../domain/patch";
import type { PatchQueriesPort } from "../patches.ports";
import type { PatchImportService } from "./patch-import.service";
import type { PatchWatchlistService } from "./patch-watchlist.service";

/** "Your pool": heroes with this many ranked games in the window, plus watchlisted heroes. */
const POOL_WINDOW_MS = 90 * 86_400_000;
const POOL_MIN_GAMES = 3;

/** A player's ranked results over a time range (from the matches feature). */
export interface RankedResultsSource {
  rankedResults(
    accountId32: number,
    range: { from: Date; to: Date },
  ): Promise<Array<{ heroId: number; startedAt: Date; result: "win" | "loss" } & object>>;
}

/** Reading patches, keeping them fresh, and what the latest one means for a player. */
export class PatchesService {
  constructor(
    private readonly deps: {
      queries: PatchQueriesPort;
      importer: () => PatchImportService;
      watchlists: PatchWatchlistService;
      ranked: RankedResultsSource;
      logger: Pick<Logger, "info" | "warn" | "error">;
    },
  ) {}

  list(opts: { cursor?: string | null; limit?: number }) {
    return this.deps.queries.list(opts);
  }

  latest() {
    return this.deps.queries.latest();
  }

  getByVersion(version: string) {
    return this.deps.queries.getByVersion(version);
  }

  /** A patch with its change summary; null for an unknown version. */
  async detail(version: string) {
    const patch = await this.deps.queries.getByVersion(version);
    return patch ? { ...patch, summary: diffSummary(patch) } : null;
  }

  /**
   * For pages: import the latest patches when none are stored or the last successful refresh
   * is over 24h old. Throttled across instances; never throws (logs and continues), so a
   * page can always render whatever is already stored.
   */
  async ensureFresh(): Promise<void> {
    const { logger } = this.deps;
    try {
      const started = Date.now();
      const res = await this.deps.importer().refreshIfStale();
      if (!res.ran) return;
      const durationMs = Date.now() - started;
      if (res.result.ok)
        logger.info("patch_refresh_completed", {
          trigger: "lazy",
          durationMs,
          outcomes: res.result.value,
        });
      else
        logger.warn("patch_refresh_failed", {
          trigger: "lazy",
          durationMs,
          reason: res.result.error.error.type,
        });
    } catch (e) {
      logger.error("patch_refresh_error", { trigger: "lazy", error: e });
    }
  }

  /** "Your pool": heroes with 3+ ranked games in the last 90 days, plus watchlisted heroes. */
  async heroPool(
    user: { id: string; accountId32: number },
    now: Date,
  ): Promise<{ heroIds: number[]; watchlist: { heroIds: number[]; itemIds: number[] } }> {
    const [recent, watchlist] = await Promise.all([
      this.deps.ranked.rankedResults(user.accountId32, {
        from: new Date(now.getTime() - POOL_WINDOW_MS),
        to: now,
      }),
      this.deps.watchlists.get(user.id),
    ]);
    const counts = new Map<number, number>();
    for (const m of recent) counts.set(m.heroId, (counts.get(m.heroId) ?? 0) + 1);
    const played = [...counts].filter(([, n]) => n >= POOL_MIN_GAMES).map(([id]) => id);
    return {
      heroIds: [...new Set([...watchlist.heroIds, ...played])],
      watchlist: { heroIds: watchlist.heroIds, itemIds: watchlist.itemIds },
    };
  }

  /**
   * How the latest imported patch affects this player: their pool against the patch's hero
   * changes, with before/after records. Null when no patch is imported.
   */
  async latestDigest(
    user: { id: string; accountId32: number },
    now: Date,
  ): Promise<PatchDigest | null> {
    const latest = await this.deps.queries.latest();
    if (!latest) return null;
    const patch = await this.deps.queries.getByVersion(latest.version);
    if (!patch) return null;
    const released = patch.publishedAt.getTime();
    const [pool, results] = await Promise.all([
      this.heroPool(user, now),
      this.deps.ranked.rankedResults(user.accountId32, {
        from: new Date(released - COHORT_WINDOW_MS),
        to: new Date(Math.min(now.getTime(), released + COHORT_WINDOW_MS)),
      }),
    ]);
    return patchDigest({ patch, poolHeroIds: pool.heroIds, results });
  }
}
