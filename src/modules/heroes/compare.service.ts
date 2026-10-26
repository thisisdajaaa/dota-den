import {
  bracketOf,
  compareToRank,
  MAX_COMPARE_HEROES,
  MIN_COMPARE_GAMES,
  nextBracket,
  type CompareGame,
  type CurvePoint,
  type RankBracket,
} from "./domain/compare";
import type { CompareView } from "./dtos/responses/compare.dto";

/** The window of your games that's compared. */
export const COMPARE_DAYS = 60;
/** Heroes shown without Plus (the most played one). */
export const FREE_COMPARE_HEROES = 1;

/**
 * How you compare: your heroes against players at your rank (or the rank above, to see what
 * climbing takes), at the same game length. Plus sees up to eight heroes; free, the most
 * played one. The weakest and strongest spots are found over the heroes you can see.
 */
export class CompareService {
  constructor(
    private readonly deps: {
      games: (accountId32: number, days: number) => Promise<CompareGame[] | null>;
      rankTier: (accountId32: number) => Promise<number | null>;
      curves: (
        heroIds: readonly number[],
        bracket: RankBracket,
      ) => Promise<ReadonlyMap<number, readonly CurvePoint[]> | null>;
      isPlus: (userId: string) => Promise<boolean>;
    },
  ) {}

  async compare(
    user: { id: string; accountId32: number },
    target: "mine" | "next" = "mine",
  ): Promise<CompareView> {
    const [games, tier, plus] = await Promise.all([
      this.deps.games(user.accountId32, COMPARE_DAYS).catch(() => null),
      this.deps.rankTier(user.accountId32).catch(() => null),
      this.deps.isPlus(user.id).catch(() => false),
    ]);
    const yourBracket = bracketOf(tier);
    const bracket = yourBracket && (target === "next" ? nextBracket(yourBracket) : yourBracket);
    const plan: CompareView["plan"] = plus ? "plus" : "free";
    const base = {
      windowDays: COMPARE_DAYS,
      yourBracket,
      bracket,
      heroes: [],
      locked: 0,
      plan,
      weakest: null,
      strongest: null,
    };
    if (!bracket) return { status: "unranked", ...base };
    if (!games) return { status: "unavailable", ...base };
    // Rank curves only for the heroes that can be compared (most played first).
    const counts = new Map<number, number>();
    for (const g of games) counts.set(g.heroId, (counts.get(g.heroId) ?? 0) + 1);
    const ids = [...counts]
      .filter(([, n]) => n >= MIN_COMPARE_GAMES)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_COMPARE_HEROES)
      .map(([id]) => id);
    if (ids.length === 0) return { status: "too_few", ...base };
    const curves = await this.deps.curves(ids, bracket).catch(() => null);
    if (!curves) return { status: "unavailable", ...base };
    const all = compareToRank(games, curves);
    if (all.heroes.length === 0) return { status: "too_few", ...base };
    const shown = plus ? all.heroes : all.heroes.slice(0, FREE_COMPARE_HEROES);
    const visible = plus
      ? all
      : compareToRank(
          games.filter((g) => shown.some((h) => h.heroId === g.heroId)),
          curves,
        );
    return {
      status: "ok",
      ...base,
      heroes: shown,
      locked: all.heroes.length - shown.length,
      weakest: visible.weakest,
      strongest: visible.strongest,
    };
  }
}
