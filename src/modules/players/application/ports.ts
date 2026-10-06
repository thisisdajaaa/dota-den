import type { Result } from "@/common/result";
import type { PlayerFollow } from "../domain/follow";
import type { HeroUsage, Peer, PlayerSearchHit, WinLoss } from "../domain/public-player";

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/** Public player lookups against the upstream (OpenDota). Read-only. */
export interface PlayerDirectory {
  /** Name search, best matches first. */
  search(q: string): Promise<Result<PlayerSearchHit[], ProviderError>>;
  winLoss(accountId32: number): Promise<Result<WinLoss, ProviderError>>;
  heroes(accountId32: number): Promise<Result<HeroUsage[], ProviderError>>;
  peers(accountId32: number): Promise<Result<Peer[], ProviderError>>;
  /** Start time of the most recent public match, or null when there is none. */
  lastMatchAt(accountId32: number): Promise<Result<Date | null, ProviderError>>;
}

export interface FollowRepository {
  /** Idempotent: `false` when the follow already existed. */
  add(follow: PlayerFollow): Promise<boolean>;
  /** Scoped by owner; `false` when there was nothing to remove. */
  remove(userId: string, accountId32: number): Promise<boolean>;
  /** One user's follows, most recently added first. */
  list(userId: string): Promise<PlayerFollow[]>;
  count(userId: string): Promise<number>;
  find(userId: string, accountId32: number): Promise<PlayerFollow | null>;
}
