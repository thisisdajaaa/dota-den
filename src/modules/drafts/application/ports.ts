import type { Result } from "@/modules/shared/domain/result";

export interface AdvisorHero {
  id: number;
  name: string;
  roles: readonly string[];
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
  available: readonly AdvisorHero[];
}

export type AdvisorError =
  | { type: "not_configured" }
  | { type: "unavailable"; cause: string }
  | { type: "invalid_response"; cause: string };

/** A model that proposes the next pick/ban. Its answer is always re-validated by the caller. */
export interface DraftAdvisor {
  readonly model: string;
  suggest(req: AdvisorRequest): Promise<Result<{ heroId: number; reason: string }, AdvisorError>>;
}
