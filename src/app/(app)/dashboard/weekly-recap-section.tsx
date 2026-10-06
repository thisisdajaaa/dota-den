import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { mmrInsightsService } from "@/modules/mmr";
import { WeeklyRecapCard } from "@/modules/mmr/ui/weekly-recap-card";

async function loadRecap(user: User, timeZone: string) {
  try {
    return await mmrInsightsService.weeklyRecap(
      { userId: user.id, accountId32: user.accountId32 },
      timeZone,
    );
  } catch (error) {
    logger.warn("weekly_recap_failed", { error });
    return null;
  }
}

const shortDay = (k: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${k}T12:00:00Z`),
  );

/** This week against last week. Renders nothing without ranked games in either. */
export async function WeeklyRecapSection({
  user,
  heroes,
  timeZone,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const recap = await loadRecap(user, timeZone);
  if (!recap || (recap.thisWeek.games === 0 && recap.lastWeek.games === 0)) return null;
  return (
    <WeeklyRecapCard
      recap={recap}
      heroes={heroes}
      rangeLabel={`${shortDay(recap.from)} – ${shortDay(recap.to)}`}
    />
  );
}
