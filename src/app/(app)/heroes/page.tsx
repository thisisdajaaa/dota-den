import { cn } from "cn";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartColumn, Eye, Gauge, Skull, Swords } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { advisorService } from "@/modules/advisor";
import { PoolAdviceCard } from "@/modules/advisor/ui/pool-advice-card";
import { heroesService } from "@/modules/heroes";
import { HeroGrid, unavailableCopy } from "@/modules/heroes/ui/hero-sections";
import { LaneBreakdownCard } from "@/modules/heroes/ui/lane-breakdown-card";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { matchesService } from "@/modules/matches";
import { getCurrentUser } from "@/modules/identity";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.title") };
}

/** Heroes from which the list gets a side column of advice (fewer: the advice goes below). */
const WIDE_LIST_MIN = 12;

export default async function HeroesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const [rows, heroes] = await Promise.all([
    heroesService.index(user.accountId32),
    matchesService.heroMap(),
  ]);
  const games = rows.reduce((n, r) => n + r.games, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("heroes.index.kicker")}
        title={t("heroes.index.title")}
        description={
          rows.length > 0
            ? t("heroes.index.description", {
                heroes: plural(t, "heroes.counts.heroes", rows.length),
                games: plural(t, "heroes.counts.importedGames", games),
              })
            : t("heroes.index.descriptionEmpty")
        }
        actions={
          rows.length > 0 && (
            <>
              <Link
                href="/heroes/compare"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-card/60 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold/10 touch:min-h-11"
              >
                <Gauge aria-hidden className="size-4" />
                {t("heroes.compare.link")}
              </Link>
              <Link
                href="/heroes/matchups"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-card/60 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold/10 touch:min-h-11"
              >
                <Swords aria-hidden className="size-4" />
                {t("heroes.own.link")}
              </Link>
              <Link
                href="/heroes/splits"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-card/60 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold/10 touch:min-h-11"
              >
                <ChartColumn aria-hidden className="size-4" />
                {t("heroes.splits.link")}
              </Link>
              <Link
                href="/heroes/wards"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-card/60 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold/10 touch:min-h-11"
              >
                <Eye aria-hidden className="size-4" />
                {t("heroes.wards.link")}
              </Link>
              <Link
                href="/heroes/deaths"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-card/60 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold/10 touch:min-h-11"
              >
                <Skull aria-hidden className="size-4" />
                {t("heroes.deaths.link")}
              </Link>
            </>
          )
        }
      />

      {/* A long hero list keeps the advice beside it; a short one spans the page with the
          advice below in two columns, so neither side is left mostly empty. */}
      <div
        className={cn("grid grid-cols-1 gap-6", rows.length >= WIDE_LIST_MIN && "lg:grid-cols-5")}
      >
        <div className={cn(rows.length >= WIDE_LIST_MIN && "lg:col-span-3")}>
          {rows.length === 0 ? (
            <EmptyState
              icon={Swords}
              title={t("heroes.index.emptyTitle")}
              description={t("heroes.index.emptyBody")}
              action={{ href: "/dashboard", label: t("heroes.index.emptyLink") }}
            />
          ) : (
            <HeroGrid
              rows={rows}
              heroes={heroes}
              now={new Date()}
              wide={rows.length < WIDE_LIST_MIN}
            />
          )}
        </div>
        <div className={cn(rows.length >= WIDE_LIST_MIN ? "space-y-6 lg:col-span-2" : "card-flow")}>
          <Suspense
            fallback={<SectionSkeleton label={t("heroes.index.loadingSuggestions")} rows={3} />}
          >
            <PoolAdvice accountId32={user.accountId32} heroes={heroes} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label={t("heroes.index.loadingLanes")} rows={5} />}>
            <Lanes accountId32={user.accountId32} heroes={heroes} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Lanes({
  accountId32,
  heroes,
}: {
  accountId32: number;
  heroes: Map<number, HeroInfo>;
}) {
  const res = await heroesService.laneBreakdown(accountId32).catch((e: unknown) => {
    logger.error("heroes_lanes_failed", { error: e });
    return { ok: false as const, error: { type: "error" as const } };
  });
  if (!res.ok) {
    const t = await getT();
    return (
      <MetaSection
        id="lane-breakdown"
        kicker={t("heroes.lanes.kicker")}
        title={t("heroes.lanes.title")}
      >
        <Unavailable>{unavailableCopy(res.error, "lane data", t)}</Unavailable>
      </MetaSection>
    );
  }
  return <LaneBreakdownCard view={res.value} heroes={heroes} full />;
}

async function PoolAdvice({
  accountId32,
  heroes,
}: {
  accountId32: number;
  heroes: Map<number, HeroInfo>;
}) {
  const view = await advisorService.poolAdvice(accountId32).catch((error: unknown) => {
    logger.warn("pool_advice_failed", { error });
    return { status: "unavailable" as const };
  });
  return <PoolAdviceCard view={view} heroes={heroes} />;
}
