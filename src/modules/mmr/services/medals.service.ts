import type { Logger } from "@/common/logging/logger";
import type { MedalDoc } from "../mmr.model";

export interface MedalStore {
  recordSighting(accountId32: number, rankTier: number | null, now: Date): Promise<void>;
  history(accountId32: number): Promise<MedalDoc[]>;
}

/** Medal history from public profiles: a new row whenever the medal changes. */
export class MedalService {
  constructor(private readonly deps: { store: MedalStore; logger: Pick<Logger, "warn"> }) {}

  /** Note the player's current medal (a change adds to their history). Never throws. */
  async record(accountId32: number, rankTier: number | null): Promise<void> {
    try {
      await this.deps.store.recordSighting(accountId32, rankTier, new Date());
    } catch (e) {
      this.deps.logger.warn("medal_record_failed", {
        accountId32,
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  /** Medal sightings, oldest first. */
  history(accountId32: number) {
    return this.deps.store.history(accountId32);
  }
}
