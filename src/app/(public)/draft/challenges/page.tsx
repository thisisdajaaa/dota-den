import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Crosshair, ListOrdered, Swords } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CHALLENGE_TYPES, type ChallengeType } from "@/modules/drafts/domain/challenges";
import { ChallengeHistory } from "@/modules/drafts/ui/challenge-history";
import { viewerChallengeStreak } from "@/modules/leaderboards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("drafts.challengesPage.title") };
}

const ICONS: Record<ChallengeType, typeof Swords> = {
  last_pick: Swords,
  counter_pick: Crosshair,
  ban_priority: Ban,
  first_phase_bans: ListOrdered,
};

export default async function DraftChallengesPage() {
  // Signed in: the streak saved on the account; guests keep this device's progress.
  const [saved, t] = await Promise.all([viewerChallengeStreak(), getT()]);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.pages.kicker")}
        title={t("drafts.challengesPage.title")}
        description={t("drafts.challengesPage.description")}
        actions={
          <Button asChild variant="outline">
            <Link href="/draft">{t("drafts.pages.backToDrafting")}</Link>
          </Button>
        }
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CHALLENGE_TYPES.map((type) => {
          const title = t(`drafts.challenge.types.${type}.title`);
          const Icon = ICONS[type];
          return (
            <li key={type} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-5 text-gold" />
                <h2 className="font-display text-xl font-semibold tracking-wide">{title}</h2>
              </div>
              <p className="flex-1 text-sm text-muted-foreground">
                {t(`drafts.challenge.types.${type}.summary`)}
              </p>
              <Button asChild className="self-start">
                <Link
                  href={`/draft/challenges/${type}`}
                  aria-label={t("drafts.challengesPage.startLabel", { title })}
                >
                  {t("drafts.challengesPage.start")} <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>

      <ChallengeHistory saved={saved} />

      {saved && (
        <p className="text-sm text-muted-foreground">
          {t("drafts.challengesPage.leaderboardBefore")}{" "}
          <Link href="/leaderboards?board=challenges" className="text-gold hover:underline">
            {t("drafts.challengesPage.leaderboardLink")}
          </Link>
          {t("drafts.challengesPage.leaderboardAfter")}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t("drafts.challengesPage.footnote")}</p>
    </div>
  );
}
