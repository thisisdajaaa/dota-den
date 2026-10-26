import type { HeroCompare, RankBracket, StatGap } from "../../domain/compare";

/** /heroes/compare: your heroes against players at a rank, at the same game length. */
export interface CompareView {
  /** `unavailable`: the rank averages failed; `no_games`: your games couldn't be loaded. */
  status: "ok" | "unavailable" | "no_games" | "too_few" | "unranked";
  /**
   * True when OpenDota was down and your imported games were used instead: those have no last
   * hits, so only kills + assists and deaths are compared.
   */
  fromImported: boolean;
  windowDays: number;
  /** Your bracket (from your rank medal), and the one compared against. */
  yourBracket: RankBracket | null;
  bracket: RankBracket | null;
  heroes: HeroCompare[];
  /** Further heroes Plus would show. */
  locked: number;
  plan: "plus" | "free";
  weakest: { heroId: number; stat: StatGap } | null;
  strongest: { heroId: number; stat: StatGap } | null;
}
