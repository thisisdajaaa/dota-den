/** How often a player's matches may be synced, and how much one sync may read (pure). */

export const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
/** Shorter wait between syncs while older history is still being imported. */
export const BACKFILL_COOLDOWN_MS = 30 * 1000;
/** History pages one sync (on a visit, or one background chunk) may read. */
export const MAX_PAGES_PER_SYNC = 5;

/**
 * Plus priority sync (ADR 0014): a long history imports faster, inside the same global
 * OpenDota budget. Only the pace of one player's own import changes; the budget every call
 * draws from (and its member/guest split) is shared, so free players aren't starved.
 */
export const PLUS_BACKFILL_COOLDOWN_MS = 10 * 1000;
export const PLUS_MAX_PAGES_PER_SYNC = 8;

export interface SyncPolicy {
  /** Wait between syncs while older history is still importing (the backfill cooldown). */
  backfillCooldownMs: number;
  /** Wait between syncs once the history is complete (the same for everyone). */
  cooldownMs: number;
  /** History pages one sync may read. */
  maxPages: number;
}

export const FREE_SYNC_POLICY: SyncPolicy = {
  backfillCooldownMs: BACKFILL_COOLDOWN_MS,
  cooldownMs: SYNC_COOLDOWN_MS,
  maxPages: MAX_PAGES_PER_SYNC,
};

export const PLUS_SYNC_POLICY: SyncPolicy = {
  backfillCooldownMs: PLUS_BACKFILL_COOLDOWN_MS,
  cooldownMs: SYNC_COOLDOWN_MS,
  maxPages: PLUS_MAX_PAGES_PER_SYNC,
};

export function policyFor(isPlus: boolean): SyncPolicy {
  return isPlus ? PLUS_SYNC_POLICY : FREE_SYNC_POLICY;
}

/** The cooldown that applies to a sync state: shorter while history is still importing. */
export function cooldownFor(backfillComplete: boolean, policy: SyncPolicy): number {
  return backfillComplete ? policy.cooldownMs : policy.backfillCooldownMs;
}

/** Auto parse requests for Plus (ADR 0014): newest unparsed games per sync, at most. */
export const AUTO_PARSE_PER_SYNC = 3;
/** Only games this recent: Valve keeps replays for about two weeks. */
export const AUTO_PARSE_MAX_AGE_MS = 7 * 24 * 3_600_000;
/** A match asked for once isn't asked for again (by the auto requests) for this long. */
export const AUTO_PARSE_DEDUP_MS = 3 * 24 * 3_600_000;
/** Parse requests per player (or visitor) per window: the button's limit, and auto requests'. */
export const PARSE_REQUEST_LIMIT = { limit: 6, windowMs: 10 * 60_000 } as const;
