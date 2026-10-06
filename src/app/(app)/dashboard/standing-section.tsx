import { logger } from "@/common/logging/logger";
import type { StandingView } from "@/modules/leaderboards/application/contracts";
import { getLeaderboardService } from "@/modules/leaderboards/composition";
import { StandingCard, StandingUnavailable } from "@/modules/leaderboards/ui/standing-card";

/**
 * The overview's "Your standing" card. Streams behind Suspense; a failure blanks only this
 * card, never the rest of the dashboard.
 */
export async function StandingSection({ user }: { user: { id: string; accountId32: number } }) {
  let standings: StandingView[] | null = null;
  try {
    standings = await (
      await getLeaderboardService()
    ).standing({ userId: user.id, accountId32: user.accountId32 });
  } catch (error) {
    logger.error("standing_section_failed", { error });
  }
  return standings ? <StandingCard standings={standings} /> : <StandingUnavailable />;
}
