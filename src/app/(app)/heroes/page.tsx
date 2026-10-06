import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Swords } from "lucide-react";
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
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {rows.length === 0 ? (
            <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
              <Swords aria-hidden className="size-8 text-gold" />
              <h2 className="text-lg font-semibold">{t("heroes.index.emptyTitle")}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("heroes.index.emptyBefore")}{" "}
                <Link href="/dashboard" className="text-gold hover:underline">
                  {t("heroes.index.emptyLink")}
                </Link>{" "}
                {t("heroes.index.emptyAfter")}
              </p>
            </section>
          ) : (
            <HeroGrid rows={rows} heroes={heroes} now={new Date()} />
          )}
        </div>
        <div className="space-y-6 lg:col-span-2">
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
