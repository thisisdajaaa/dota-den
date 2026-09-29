import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getHeroMap } from "@/modules/matches/composition";
import { getChallengeService } from "@/modules/drafts/composition";
import {
  CHALLENGE_INFO,
  describePosition,
  isChallengeType,
  isValidSeed,
  newSeed,
} from "@/modules/drafts/domain/challenges";
import { ChallengeBoard } from "@/modules/drafts/ui/challenge-board";
import type { DraftHero } from "@/modules/drafts/ui/types";

export async function generateMetadata({
  params,
}: PageProps<"/draft/challenges/[type]">): Promise<Metadata> {
  const { type } = await params;
  return {
    title: isChallengeType(type) ? `${CHALLENGE_INFO[type].title} challenge` : "Draft challenge",
  };
}

function Problem({ title, body, cta }: { title: string; body: string; cta?: boolean }) {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Draft challenges" title="Draft challenge" />
      <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
        <AlertTriangle aria-hidden className="size-8 text-gold" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{body}</p>
        {cta !== false && (
          <Button asChild>
            <Link href="/draft/challenges">Choose a challenge</Link>
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

  if (!isChallengeType(type)) {
    return (
      <Problem
        title="This challenge doesn't exist"
        body="The link may have been cut off or edited. Pick one of the available challenges instead."
      />
    );
  }
  // A fresh puzzle gets its seed in the URL so it can be shared and replayed.
  if (seed === undefined) redirect(`/draft/challenges/${type}?seed=${newSeed()}`);
  if (!isValidSeed(seed)) {
    return (
      <Problem
        title="This puzzle link is broken"
        body="The puzzle code in the link isn't valid. Start a fresh puzzle instead."
      />
    );
  }

  const [heroMap, service] = await Promise.all([getHeroMap(), getChallengeService()]);
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
        title="Hero list unavailable"
        body="We couldn't load enough heroes from OpenDota to build a puzzle. Please try again in a minute."
      />
    );
  }

  const info = CHALLENGE_INFO[type];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Draft challenges"
        title={info.title}
        description={info.summary}
        actions={
          <Button asChild variant="outline">
            <Link href="/draft/challenges">All challenges</Link>
          </Button>
        }
      />
      <ChallengeBoard
        key={`${type}-${seed}`}
        puzzle={puzzle.value}
        info={info}
        situation={describePosition(puzzle.value, heroes)}
        heroes={heroes}
      />
    </div>
  );
}
