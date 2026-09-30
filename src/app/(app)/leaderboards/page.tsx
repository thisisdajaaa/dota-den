import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/modules/identity/composition";
import type { BoardView } from "@/modules/leaderboards/application/contracts";
import { getLeaderboardService } from "@/modules/leaderboards/composition";
import { isPeriod, PERIODS, type Period } from "@/modules/leaderboards/domain/period";
import {
  BOARDS,
  isBoardKind,
  isScope,
  SCOPES,
  type BoardKind,
  type Scope,
} from "@/modules/leaderboards/domain/ranking";
import {
  BOARD_LABEL,
  leaderboardHref,
  PERIOD_LABEL,
  SCOPE_LABEL,
} from "@/modules/leaderboards/ui/copy";
import { LeaderboardBoard } from "@/modules/leaderboards/ui/leaderboard-board";

export const metadata: Metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({ searchParams }: PageProps<"/leaderboards">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const board: BoardKind = isBoardKind(params.board) ? params.board : "drafts";
  const scope: Scope = isScope(params.scope) ? params.scope : "friends";
  const period: Period = isPeriod(params.period) ? params.period : "week";

  let view: BoardView | null = null;
  try {
    view = await (
      await getLeaderboardService()
    ).board({
      viewer: { userId: user.id, accountId32: user.accountId32 },
      kind: board,
      scope,
      period,
      now: new Date(),
    });
  } catch (error) {
    logger.error("leaderboard_failed", { board, scope, period, error });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Compete"
        title="Leaderboards"
        description="See who's drafting the most among your friends, or across Dota Den. Draft games, draft challenges and friend rooms each have their own board."
        actions={
          <Button asChild variant="outline">
            <Link href="/draft/rooms/new">
              <UserPlus aria-hidden className="size-4" /> Invite a friend
            </Link>
          </Button>
        }
      />

      <SegmentedLinks
        label="Leaderboard"
        options={BOARDS.map((value) => ({ value, label: BOARD_LABEL[value] }))}
        active={board}
        href={(value) => leaderboardHref({ board: value, scope, period })}
      />
      <div className="flex flex-wrap gap-3">
        <SegmentedLinks
          label="Who"
          options={SCOPES.map((value) => ({ value, label: SCOPE_LABEL[value] }))}
          active={scope}
          href={(value) => leaderboardHref({ board, scope: value, period })}
        />
        <SegmentedLinks
          label="When"
          options={PERIODS.map((value) => ({ value, label: PERIOD_LABEL[value] }))}
          active={period}
          href={(value) => leaderboardHref({ board, scope, period: value })}
        />
      </div>

      {view ? (
        <LeaderboardBoard view={view} />
      ) : (
        <section
          role="alert"
          className="panel grid place-items-center gap-3 px-6 py-16 text-center"
        >
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <h2 className="text-lg font-semibold">This leaderboard is unavailable right now</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Please try again in a minute. Your drafts and answers are still being saved.
          </p>
        </section>
      )}
    </div>
  );
}
