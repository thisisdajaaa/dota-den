import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { EXTRAS_PER_DAY, matchExtrasFrom, type MatchExtras } from "../domain/match-extras";
import type { MatchDetailProvider, MatchExtrasStore, PendingExtras } from "../matches.ports";

const DAY_MS = 24 * 3_600_000;

export type ExtrasOutcome =
  | "done"
  | "capped"
  | "nothing"
  | "busy"
  | "no_catalog"
  | "out_of_time"
  | "rate_limited"
  | "unavailable";

export interface ExtrasRun {
  outcome: ExtrasOutcome;
  /** Match details fetched (each counts toward the daily cap). */
  fetched: number;
  /** Of those, parsed games stored with extras. */
  parsed: number;
}

/**
 * Fills match_extras a little at a time: at most EXTRAS_PER_DAY match details per player per
 * day, most recent parsed games first. A stored match is never fetched again; a game without
 * replay data is stored as such, so missing stays missing.
 */
export class MatchExtrasService {
  /** Accounts being filled on this server right now (one run per account at a time). */
  private readonly running = new Set<number>();

  constructor(
    private readonly deps: {
      store: MatchExtrasStore;
      provider: Pick<MatchDetailProvider, "fetchMatch">;
      /** Which item keys are completed items; null when the item catalog is unavailable. */
      completedItems: () => Promise<((key: string) => boolean) | null>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => number;
      perDay?: number;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? Date.now();
  }

  /** One player's next few match details, until the daily cap or `deadline` (ms epoch). */
  async backfill(accountId32: number, opts: { deadline?: number } = {}): Promise<ExtrasRun> {
    const run: ExtrasRun = { outcome: "done", fetched: 0, parsed: 0 };
    if (this.running.has(accountId32)) return { ...run, outcome: "busy" };
    this.running.add(accountId32);
    try {
      const { store } = this.deps;
      const perDay = this.deps.perDay ?? EXTRAS_PER_DAY;
      const used = await store.fetchedSince(accountId32, new Date(this.now() - DAY_MS));
      if (used >= perDay) return { ...run, outcome: "capped" };
      const pending = await store.pendingParsed(accountId32, perDay - used);
      if (pending.length === 0) return { ...run, outcome: "nothing" };
      const isItem = await this.deps.completedItems();
      // Without the item catalog we can't tell completed items from parts: try another day.
      if (!isItem) return { ...run, outcome: "no_catalog" };

      for (const game of pending) {
        if (opts.deadline !== undefined && this.now() >= opts.deadline)
          return { ...run, outcome: "out_of_time" };
        const res = await this.deps.provider.fetchMatch(game.matchId);
        if (!res.ok && (res.error.type === "rate_limited" || res.error.type === "unavailable")) {
          // Upstream trouble: nothing is stored, the game is tried again on a later run.
          return { ...run, outcome: res.error.type };
        }
        run.fetched++;
        const extras = res.ok
          ? (matchExtrasFrom(res.value, { accountId32, ...game }, isItem) ??
            missing(accountId32, game))
          : missing(accountId32, game);
        if (extras.parsed) run.parsed++;
        await store.save(extras, new Date(this.now()));
      }
      return run;
    } finally {
      this.running.delete(accountId32);
    }
  }

  /**
   * The daily cron's share: each account in turn until `budgetMs` runs out. Stops early when
   * OpenDota is busy or down, so the rest of the run isn't spent on failing calls.
   */
  async backfillMany(
    accountIds: readonly number[],
    opts: { budgetMs: number },
  ): Promise<{ accounts: number; fetched: number; parsed: number; stoppedEarly: boolean }> {
    const deadline = this.now() + opts.budgetMs;
    const out = { accounts: 0, fetched: 0, parsed: 0, stoppedEarly: false };
    for (const accountId32 of accountIds) {
      if (this.now() >= deadline) {
        out.stoppedEarly = true;
        break;
      }
      try {
        const run = await this.backfill(accountId32, { deadline });
        out.accounts++;
        out.fetched += run.fetched;
        out.parsed += run.parsed;
        if (["rate_limited", "unavailable", "out_of_time"].includes(run.outcome)) {
          out.stoppedEarly = true;
          break;
        }
      } catch (error) {
        this.deps.logger.warn("match_extras_failed", { accountId32, error });
      }
    }
    this.deps.logger.info("match_extras_run", out);
    return out;
  }

  /** Your stored extras on one hero, and how many of your games on it OpenDota has parsed. */
  async forHero(
    accountId32: number,
    heroId: number,
  ): Promise<{ games: MatchExtras[]; parsedGames: number }> {
    const [games, parsedGames] = await Promise.all([
      this.deps.store.forHero(accountId32, heroId),
      this.deps.store.parsedGamesOnHero(accountId32, heroId),
    ]);
    // A game stored as parsed counts even if its imported row predates the parse.
    return { games, parsedGames: Math.max(parsedGames, games.length) };
  }

  async exportMyData(owner: DataOwner) {
    return { matchExtras: await this.deps.store.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { matchExtras: await this.deps.store.deleteForOwner(owner) };
  }
}

/** A game with no replay data to keep (unparsed, not found, or you aren't in it). */
function missing(accountId32: number, game: PendingExtras): MatchExtras {
  return {
    accountId32,
    matchId: game.matchId,
    heroId: game.heroId,
    startedAt: game.startedAt,
    result: game.result,
    parsed: false,
    laneRole: null,
    roaming: false,
    efficiencyPct: null,
    laneResult: null,
    itemTimings: [],
  };
}
