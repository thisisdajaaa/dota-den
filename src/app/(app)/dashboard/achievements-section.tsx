import { logger } from "@/common/logging/logger";
import { achievementsService } from "@/modules/achievements";
import { AchievementsCard } from "@/modules/achievements/ui/achievements-card";
import type { User } from "@/modules/identity";

/** Achievements from your own games, MMR log and drafts. */
export async function AchievementsSection({ user, timeZone }: { user: User; timeZone: string }) {
  const items = await achievementsService
    .forPlayer({ userId: user.id, accountId32: user.accountId32 }, timeZone)
    .catch((error: unknown) => {
      logger.warn("achievements_failed", { error });
      return null;
    });
  return items ? <AchievementsCard items={items} /> : null;
}
