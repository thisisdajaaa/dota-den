import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import { compareService } from "@/modules/heroes";
import { CompareTeaser } from "@/modules/heroes/ui/compare-view";
import type { HeroInfo } from "@/modules/matches/domain/read-models";

/** Your biggest gap and edge against players at your rank (How you compare); hidden on failure. */
export async function CompareSection({
  user,
  heroes,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
}) {
  const view = await compareService
    .compare({ id: user.id, accountId32: user.accountId32 })
    .catch((error: unknown) => {
      logger.warn("dashboard_compare_failed", { error });
      return null;
    });
  return view ? <CompareTeaser view={view} heroes={heroes} /> : null;
}
