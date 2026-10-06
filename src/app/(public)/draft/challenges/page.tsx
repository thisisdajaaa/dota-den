import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban, Crosshair, ListOrdered, Swords } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  CHALLENGE_INFO,
  CHALLENGE_TYPES,
  type ChallengeType,
} from "@/modules/drafts/domain/challenges";
import { ChallengeHistory } from "@/modules/drafts/ui/challenge-history";
import { viewerChallengeStreak } from "@/modules/leaderboards";

export const metadata: Metadata = { title: "Draft challenges" };

const ICONS: Record<ChallengeType, typeof Swords> = {
  last_pick: Swords,
  counter_pick: Crosshair,
  ban_priority: Ban,
  first_phase_bans: ListOrdered,
};

export default async function DraftChallengesPage() {
  // Signed in: the streak saved on the account; guests keep this device's progress.
  const saved = await viewerChallengeStreak();
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Draft practice"
        title="Draft challenges"
        description="Short drafting puzzles graded with real high-rank data. Each answer gets a grade, the reasons behind it and the strongest alternatives."
        actions={
          <Button asChild variant="outline">
            <Link href="/draft">Back to drafting</Link>
          </Button>
        }
      />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CHALLENGE_TYPES.map((type) => {
          const info = CHALLENGE_INFO[type];
          const Icon = ICONS[type];
          return (
            <li key={type} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-5 text-gold" />
                <h2 className="font-display text-xl font-semibold tracking-wide">{info.title}</h2>
              </div>
              <p className="flex-1 text-sm text-muted-foreground">{info.summary}</p>
              <Button asChild className="self-start">
                <Link href={`/draft/challenges/${type}`} aria-label={`Start ${info.title}`}>
                  Start <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>

      <ChallengeHistory saved={saved} />

      {saved && (
        <p className="text-sm text-muted-foreground">
          Every first answer counts on the{" "}
          <Link href="/leaderboards?board=challenges" className="text-gold hover:underline">
            draft challenges leaderboard
          </Link>
          .
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Grades are based on high-rank win rates and head-to-head matchups; drafting also depends on
        lanes and players. We never turn this into a win probability.
      </p>
    </div>
  );
}
