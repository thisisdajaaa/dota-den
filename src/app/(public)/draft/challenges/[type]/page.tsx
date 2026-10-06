import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { matchesService } from "@/modules/matches";
import { getChallengeService } from "@/modules/drafts";
import {
  describePosition,
  isChallengeType,
  isValidSeed,
  newSeed,
} from "@/modules/drafts/domain/challenges";
import { ChallengeBoard } from "@/modules/drafts/ui/challenge-board";
import { say } from "@/modules/drafts/ui/i18n";
import type { DraftHero } from "@/modules/drafts/ui/types";
import { viewerChallengeStreak } from "@/modules/leaderboards";

export async function generateMetadata({
  params,
}: PageProps<"/draft/challenges/[type]">): Promise<Metadata> {
  const { type } = await params;
  const t = await getT();
  return {
    title: isChallengeType(type)
      ? t("drafts.challengePage.metaTitle", { title: t(`drafts.challenge.types.${type}.title`) })
      : t("drafts.challengePage.metaFallback"),
  };
}

async function Problem({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  const t = await getT();
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.challengePage.kicker")}
        title={t("drafts.challengePage.title")}
      />
      <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
        <AlertTriangle aria-hidden className="size-8 text-gold" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{body}</p>
        {cta !== false && (
          <Button asChild>
            <Link href="/draft/challenges">{t("drafts.challengePage.choose")}</Link>
          </Button>
        )}
      </section>
    </div>
  );
}

export default async function DraftChallengePage({
  params,
  searchParams,
}: PageProps<"/draft/challenges/[type]">) {
  const { type } = await params;
  const { seed } = await searchParams;
  const t = await getT();

  if (!isChallengeType(type)) {
    return (
      <Problem
        title={t("drafts.challengePage.missingTitle")}
        body={t("drafts.challengePage.missingBody")}
      />
    );
  }
  // A fresh puzzle gets its seed in the URL so it can be shared and replayed.
  if (seed === undefined) redirect(`/draft/challenges/${type}?seed=${newSeed()}`);
  if (!isValidSeed(seed)) {
    return (
      <Problem
        title={t("drafts.challengePage.brokenTitle")}
        body={t("drafts.challengePage.brokenBody")}
      />
    );
  }

  const [heroMap, service, saved] = await Promise.all([
    matchesService.heroMap(),
    getChallengeService(),
    viewerChallengeStreak(),
  ]);
  const heroes: DraftHero[] = [...heroMap.values()]
    .map((h) => ({
      id: h.id,
      name: h.name,
      imageUrl: h.imageUrl,
      iconUrl: h.iconUrl,
      primaryAttr: h.primaryAttr,
      roles: h.roles,
      attackType: h.attackType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const puzzle = service.puzzle(type, seed);
  if (!puzzle.ok) {
    return (
      <Problem
        title={t("drafts.challengePage.heroesTitle")}
        body={t("drafts.challengePage.heroesBody")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.challengePage.kicker")}
        title={t(`drafts.challenge.types.${type}.title`)}
        description={t(`drafts.challenge.types.${type}.summary`)}
        actions={
          <Button asChild variant="outline">
            <Link href="/draft/challenges">{t("drafts.challengePage.all")}</Link>
          </Button>
        }
      />
      <ChallengeBoard
        key={`${type}-${seed}`}
        puzzle={puzzle.value}
        situation={say(t, describePosition(puzzle.value, heroes))}
        heroes={heroes}
        saved={saved}
      />
    </div>
  );
}
