import { Flame } from "lucide-react";
import { logger } from "@/common/logging/logger";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { User } from "@/modules/identity/domain/user";
import { sharesService } from "@/modules/shares";
import { ShareButton } from "@/modules/shares/ui/share-button";

async function streakFor(user: User) {
  try {
    return await sharesService.currentStreak({ userId: user.id, accountId32: user.accountId32 });
  } catch (error) {
    logger.warn("streak_check_failed", { error });
    return null;
  }
}

/** During a win streak (3 or more, from imported games): a card to share it. */
export async function StreakSection({ user }: { user: User }) {
  const streak = await streakFor(user);
  if (streak === null) return null;
  const t = await getT();
  return (
    <section
      className="panel flex flex-wrap items-center justify-between gap-4 border-win/30 p-5"
      aria-labelledby="streak-kicker streak-title"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Flame aria-hidden className="size-8 shrink-0 text-gold" />
        <div className="min-w-0 space-y-1">
          <p id="streak-kicker" className="kicker">
            {t("shares.streakPrompt.kicker")}
          </p>
          <h2 id="streak-title" className="text-lg font-semibold">
            {plural(t, "shares.streakPrompt.title", streak)}
          </h2>
          <p className="text-sm text-muted-foreground">{t("shares.streakPrompt.body")}</p>
        </div>
      </div>
      <ShareButton target={{ kind: "streak" }} />
    </section>
  );
}
