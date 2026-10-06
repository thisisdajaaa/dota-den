import { logger } from "@/common/logging/logger";
import { getAchievements } from "@/modules/achievements/composition";
import { AchievementsCard } from "@/modules/achievements/ui/achievements-card";
import type { User } from "@/modules/identity/domain/user";

async function load(user: User) {
  try {
    return await getAchievements(user);
  } catch (error) {
    logger.warn("achievements_failed", { error });
    return null;
  }
}

/** Achievements from your own games, MMR log and drafts. */
export async function AchievementsSection({ user }: { user: User }) {
  const items = await load(user);
  return items ? <AchievementsCard items={items} /> : null;
}
