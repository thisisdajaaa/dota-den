import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { Button } from "@/components/ui/button";
import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import { getCurrentUser } from "@/modules/identity";
import type { BoardView } from "@/modules/leaderboards/dtos/responses/leaderboard-views.dto";
import { leaderboardService, rankedWeekService } from "@/modules/leaderboards";
import { isPeriod, PERIODS, type Period } from "@/modules/leaderboards/domain/period";
import {
  BOARDS,
  isBoardKind,
  isScope,
  SCOPES,
  type BoardKind,
  type Scope,
} from "@/modules/leaderboards/domain/ranking";
import { leaderboardHref } from "@/modules/leaderboards/ui/copy";
import { LeaderboardBoard } from "@/modules/leaderboards/ui/leaderboard-board";
import { RankedWeekCard } from "@/modules/leaderboards/ui/ranked-week-card";
import { VisibilityToggle } from "@/modules/leaderboards/ui/visibility-toggle";
import { matchesService } from "@/modules/matches";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("leaderboards.page.title") };
}

export default async function LeaderboardsPage({ searchParams }: PageProps<"/leaderboards">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const params = await searchParams;
  const board: BoardKind = isBoardKind(params.board) ? params.board : "drafts";
  const scope: Scope = isScope(params.scope) ? params.scope : "friends";
  const period: Period = isPeriod(params.period) ? params.period : "week";

  let view: BoardView | null = null;
  try {
    view = await leaderboardService.board({
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
        kicker={t("leaderboards.page.kicker")}
        title={t("leaderboards.page.title")}
        description={t("leaderboards.page.description")}
        actions={
          <Button asChild variant="outline">
            <Link href="/draft/rooms/new">
              <UserPlus aria-hidden className="size-4" /> {t("leaderboards.page.invite")}
            </Link>
          </Button>
        }
      />

      <Suspense
        fallback={<SectionSkeleton label={t("leaderboards.page.loadingRanked")} rows={4} />}
      >
        <RankedWeekSection viewer={{ userId: user.id, accountId32: user.accountId32 }} />
      </Suspense>

      <SegmentedLinks
        label={t("leaderboards.page.boardTabs")}
        options={BOARDS.map((value) => ({ value, label: t(`leaderboards.boards.${value}`) }))}
        active={board}
        href={(value) => leaderboardHref({ board: value, scope, period })}
      />
      <div className="flex flex-wrap gap-3">
        <SegmentedLinks
          label={t("leaderboards.page.whoTabs")}
          options={SCOPES.map((value) => ({ value, label: t(`leaderboards.scopes.${value}`) }))}
          active={scope}
          href={(value) => leaderboardHref({ board, scope: value, period })}
        />
        <SegmentedLinks
          label={t("leaderboards.page.whenTabs")}
          options={PERIODS.map((value) => ({ value, label: t(`leaderboards.periods.${value}`) }))}
          active={period}
          href={(value) => leaderboardHref({ board, scope, period: value })}
        />
      </div>
      {scope === "everyone" && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("leaderboards.page.everyoneNote")}
          </p>
          <VisibilityToggle listed={user.settings.profileVisibility === "public"} />
        </div>
      )}

      {view ? (
        <LeaderboardBoard view={view} />
      ) : (
        <section
          role="alert"
          className="panel grid place-items-center gap-3 px-6 py-16 text-center"
        >
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <h2 className="text-lg font-semibold">{t("leaderboards.page.unavailableTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("leaderboards.page.unavailableBody")}
          </p>
        </section>
      )}
    </div>
  );
}

async function RankedWeekSection({ viewer }: { viewer: { userId: string; accountId32: number } }) {
  const [view, heroes] = await Promise.all([
    rankedWeekService.forViewer(viewer).catch((error: unknown) => {
      logger.warn("ranked_week_failed", { error });
      return null;
    }),
    matchesService.heroMap(),
  ]);
  if (!view) return null;
  return <RankedWeekCard view={view} heroes={heroes} />;
}
