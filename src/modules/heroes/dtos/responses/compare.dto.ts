import type { HeroCompare, RankBracket, StatGap } from "../../domain/compare";

/** /heroes/compare: your heroes against players at a rank, at the same game length. */
export interface CompareView {
  status: "ok" | "unavailable" | "too_few" | "unranked";
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
