import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import { goalsService } from "@/modules/goals";
import { goalLabel, goalStatusText } from "@/modules/goals/ui/goal-text";
import { GoalsCard } from "@/modules/goals/ui/goals-card";
import type { User } from "@/modules/identity";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { heroName } from "@/modules/matches/ui/hero-portrait";

/** Up to two goals for the week, measured from the player's own games and MMR log. */
export async function GoalsSection({
  user,
  heroes,
  timeZone,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const view = await goalsService
    .weekView({ userId: user.id, accountId32: user.accountId32 }, timeZone)
    .catch((error: unknown) => {
      logger.warn("weekly_goals_failed", { error });
      return null;
    });
  if (!view) return null;
  const t = await getT();
  const name = (id: number) => heroName(heroes.get(id), id);
  const heroOptions = [...heroes.values()]
    .map((h) => ({ id: h.id, name: h.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <GoalsCard
      rows={view.thisWeek.map((r) => ({
        goal: r.goal,
        label: goalLabel(t, r.goal, name),
        current: goalStatusText(t, r.status),
        met: r.met,
        fraction: r.fraction,
      }))}
      lastWeek={view.lastWeek.map((g) => ({ label: goalLabel(t, g.goal, name), met: g.met }))}
      heroes={heroOptions}
      daysLeft={view.daysLeft}
    />
  );
}
