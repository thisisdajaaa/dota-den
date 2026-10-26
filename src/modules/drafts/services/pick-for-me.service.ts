import type { Logger } from "@/common/logging/logger";
import {
  MIN_POOL_GAMES,
  pickForMe,
  type HeroRecords,
  type PoolHero,
  type Position,
} from "../domain/pick-for-me";
import type { PickForMeResult } from "../dtos/responses/pick-for-me.dto";

/** Suggestions shown with Plus; without it, the best one (and how many more there are). */
export const PICKS_PLUS = 5;
export const PICKS_FREE = 1;

export interface PickForMeRequest {
  enemies: number[];
  allies: number[];
  bans: number[];
  position: Position | null;
}

export type { PickForMeResult };

/**
 * "Pick for me" during a real ranked draft (Plus: the top five; free: the best one). Ranks
 * the heroes the player actually plays against the enemy picks, from their own record and
 * high-rank matchups. When STRATZ can't answer it falls back to the player's own record and
 * says so; it never invents a matchup or a win chance.
 */
export class PickForMeService {
  constructor(
    private readonly deps: {
      pool: (accountId32: number) => Promise<PoolHero[]>;
      records: () => Promise<ReadonlyMap<number, HeroRecords> | null>;
      positionShares: () => Promise<ReadonlyMap<number, Record<Position, number>> | null>;
      isPlus: (userId: string) => Promise<boolean>;
      /** Counts a use (admin usage numbers); never fails. */
      used?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "warn">;
    },
  ) {}

  async suggest(
    user: { id: string; accountId32: number },
    req: PickForMeRequest,
  ): Promise<PickForMeResult> {
    const quiet = <T>(p: Promise<T>, what: string) =>
      p.catch((error: unknown) => {
        this.deps.logger.warn("pick_for_me_source_failed", { what, error });
        return null;
      });
    const [pool, records, shares, plus] = await Promise.all([
      this.deps.pool(user.accountId32),
      quiet(this.deps.records(), "records"),
      quiet(this.deps.positionShares(), "positions"),
      this.deps.isPlus(user.id).catch(() => false),
    ]);
    const all = pickForMe(
      {
        pool,
        enemies: req.enemies,
        allies: req.allies,
        unavailable: req.bans,
        position: req.position,
        records: (id) => records?.get(id),
        positionShare: (id, p) => shares?.get(id)?.[p] ?? null,
      },
      PICKS_PLUS,
    );
    const shown = plus ? PICKS_PLUS : PICKS_FREE;
    await this.deps.used?.(user.id);
    return {
      suggestions: all.slice(0, shown),
      locked: Math.max(0, all.length - shown),
      plan: plus ? "plus" : "free",
      poolSize: pool.filter((h) => h.games >= MIN_POOL_GAMES).length,
      sources: { highRank: records !== null, positions: shares !== null },
    };
  }
}
