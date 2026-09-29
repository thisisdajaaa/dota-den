import "server-only";
import type { User } from "@/modules/identity/domain/user";
import { getMatchQueries } from "@/modules/matches/composition";
import { getWatchlist } from "./composition";

const POOL_WINDOW_MS = 90 * 86_400_000;
const POOL_MIN_GAMES = 3;

/** "Your pool": heroes with 3+ ranked games in the last 90 days, plus watchlisted heroes. */
export async function getHeroPool(
  user: User,
  now: Date,
): Promise<{ heroIds: number[]; watchlist: { heroIds: number[]; itemIds: number[] } }> {
  const [recent, watchlist] = await Promise.all([
    (await getMatchQueries()).rankedResults(user.accountId32, {
      from: new Date(now.getTime() - POOL_WINDOW_MS),
      to: now,
    }),
    getWatchlist(user.id),
  ]);
  const counts = new Map<number, number>();
  for (const m of recent) counts.set(m.heroId, (counts.get(m.heroId) ?? 0) + 1);
  const played = [...counts].filter(([, n]) => n >= POOL_MIN_GAMES).map(([id]) => id);
  return {
    heroIds: [...new Set([...watchlist.heroIds, ...played])],
    watchlist: { heroIds: watchlist.heroIds, itemIds: watchlist.itemIds },
  };
}
