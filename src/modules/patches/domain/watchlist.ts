import { err, ok, type Result } from "@/common/result";

/** A user's patch watchlist: heroes and items whose changes they want surfaced. */
export interface PatchWatchlist {
  userId: string;
  heroIds: number[];
  itemIds: number[];
  updatedAt: Date | null;
}

export const WATCHLIST_MAX_HEROES = 50;
export const WATCHLIST_MAX_ITEMS = 50;

export type WatchlistError =
  { type: "too_many_heroes"; limit: number } | { type: "too_many_items"; limit: number };

export function emptyWatchlist(userId: string): PatchWatchlist {
  return { userId, heroIds: [], itemIds: [], updatedAt: null };
}

/** Deduplicate, drop invalid ids and sort ascending. */
export function normalizeIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
}

/** Validate list sizes after normalization. */
export function checkWatchlistLimits(ids: {
  heroIds: readonly number[];
  itemIds: readonly number[];
}): Result<{ heroIds: number[]; itemIds: number[] }, WatchlistError> {
  const heroIds = normalizeIds(ids.heroIds);
  const itemIds = normalizeIds(ids.itemIds);
  if (heroIds.length > WATCHLIST_MAX_HEROES)
    return err({ type: "too_many_heroes", limit: WATCHLIST_MAX_HEROES });
  if (itemIds.length > WATCHLIST_MAX_ITEMS)
    return err({ type: "too_many_items", limit: WATCHLIST_MAX_ITEMS });
  return ok({ heroIds, itemIds });
}
