import "server-only";
import type { User } from "@/modules/identity/domain/user";
import { getMatchQueries } from "@/modules/matches/composition";
import { getPatchQueries } from "./composition";
import { COHORT_WINDOW_MS, patchDigest, type PatchDigest } from "./domain/digest";
import { getHeroPool } from "./hero-pool";

/**
 * How the latest imported patch affects this user: their pool (3+ ranked games in 90 days,
 * plus watched heroes) against the patch's hero changes. Null when no patch is imported.
 */
export async function getLatestPatchDigest(user: User, now: Date): Promise<PatchDigest | null> {
  const queries = await getPatchQueries();
  const latest = await queries.latest();
  if (!latest) return null;
  const patch = await queries.getByVersion(latest.version);
  if (!patch) return null;
  const released = patch.publishedAt.getTime();
  const [pool, results] = await Promise.all([
    getHeroPool(user, now),
    (await getMatchQueries()).rankedResults(user.accountId32, {
      from: new Date(released - COHORT_WINDOW_MS),
      to: new Date(Math.min(now.getTime(), released + COHORT_WINDOW_MS)),
    }),
  ]);
  return patchDigest({ patch, poolHeroIds: pool.heroIds, results });
}
