import type { Result } from "@/modules/shared/domain/result";
import type { HeroMeta, MatchupTable } from "../domain/draft-scoring";

export interface AdvisorHero {
  id: number;
  name: string;
  roles: readonly string[];
}

export interface AdvisorCandidate {
  id: number;
  name: string;
  role: "core" | "support";
  /** Evidence lines, e.g. "53.1% win rate at high ranks", "vs opponent's Luna +4.2%". */
  facts: readonly string[];
}

export interface AdvisorRequest {
  action: "pick" | "ban";
  side: "radiant" | "dire";
  stepNumber: number;
  totalSteps: number;
  ownPicks: readonly AdvisorHero[];
  ownBans: readonly AdvisorHero[];
  enemyPicks: readonly AdvisorHero[];
  enemyBans: readonly AdvisorHero[];
  /** Plain-language lineup situation, e.g. "You have 3 cores and 0 supports: pick a support." */
  situation: string;
  /** Pre-scored shortlist; the model must choose one of these. */
  candidates: readonly AdvisorCandidate[];
}

export type AdvisorError =
  | { type: "not_configured" }
  | { type: "unavailable"; cause: string }
  | { type: "invalid_response"; cause: string };

/** A model that chooses and explains the next pick/ban. Its answer is always re-validated. */
export interface DraftAdvisor {
  readonly model: string;
  suggest(req: AdvisorRequest): Promise<Result<{ heroId: number; reason: string }, AdvisorError>>;
}

/** Public hero statistics used to ground the AI. Failures degrade to "no data", never errors. */
export interface DraftInsights {
  /** Recent high-rank public results per hero id. */
  heroMeta(): Promise<ReadonlyMap<number, HeroMeta>>;
  /** Head-to-head records for one hero against every other hero. */
  matchups(heroId: number): Promise<MatchupTable | null>;
}
