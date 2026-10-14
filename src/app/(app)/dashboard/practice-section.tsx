import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { practiceService } from "@/modules/practice";
import { PracticePlanCard } from "@/modules/practice/ui/practice-plan-card";
import { gapText, stepLabel, stepStatusText, stepWhy } from "@/modules/practice/ui/step-text";

/**
 * This week's practice plan, from the player's own data. Optional: a failure (or no ranked
 * games yet) hides the card.
 */
export async function PracticeSection({
  user,
  heroes,
  timeZone,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const view = await practiceService
    .weekView({ userId: user.id, accountId32: user.accountId32 }, timeZone)
    .catch((error: unknown) => {
      logger.warn("practice_plan_failed", { error });
      return null;
    });
  if (!view) return null;
  const t = await getT();
  const name = (id: number) => heroName(heroes.get(id), id);
  return (
    <PracticePlanCard
      basic={!view.personal}
      gaps={view.personal ? [] : view.gaps.map((g) => gapText(t, g))}
      rows={view.steps.map((s) => ({
        id: s.step.id,
        label: stepLabel(t, s.step, name, timeZone),
        why: stepWhy(t, s.step, name),
        current: stepStatusText(t, s.status, s.step),
        done: s.done,
        fraction: s.fraction,
        href: s.step.kind === "reviewLoss" ? `/matches/${s.step.matchId}` : null,
        canSwap: s.canSwap,
      }))}
    />
  );
}
