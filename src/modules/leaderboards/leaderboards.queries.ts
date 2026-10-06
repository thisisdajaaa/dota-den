import "server-only";
import { logger } from "@/common/logging/logger";
import { getCurrentUser } from "@/modules/identity";
import { activityService } from "./leaderboards.container";

/**
 * The signed-in viewer's saved challenge streak, or null for guests. An outage returns null
 * too, so the page falls back to this device's progress.
 */
export async function viewerChallengeStreak(): Promise<{ streak: number; best: number } | null> {
  const user = await getCurrentUser({ tolerateErrors: true });
  if (!user) return null;
  try {
    const s = await activityService.challengeStreak(user.id);
    return { streak: s.current, best: s.best };
  } catch (error) {
    logger.error("challenge_streak_lookup_failed", { error });
    return null;
  }
}
