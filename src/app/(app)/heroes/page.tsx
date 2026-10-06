import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Swords } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { logger } from "@/common/logging/logger";
import { advisorService } from "@/modules/advisor";
import { PoolAdviceCard } from "@/modules/advisor/ui/pool-advice-card";
import { getHeroesService } from "@/modules/heroes/composition";
import { countOf, HeroGrid, unavailableCopy } from "@/modules/heroes/ui/hero-sections";
import { LaneBreakdownCard } from "@/modules/heroes/ui/lane-breakdown-card";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { getHeroMap } from "@/modules/matches/composition";
import { plural } from "@/modules/matches/ui/format";
import { getCurrentUser } from "@/modules/identity";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";

export const metadata: Metadata = { title: "Heroes" };

export default async function HeroesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [service, heroes] = await Promise.all([getHeroesService(), getHeroMap()]);
  const rows = await service.index(user.accountId32);
  const games = rows.reduce((n, r) => n + r.games, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Heroes"
        title="Your heroes"
        description={
          rows.length > 0
            ? `${countOf(rows.length, "hero", "heroes")} across your ${plural(games, "imported game")}. Open a hero for your record, trend, matchups and items on it.`
            : "Heroes you play show up here once your matches are imported."
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {rows.length === 0 ? (
            <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
              <Swords aria-hidden className="size-8 text-gold" />
              <h2 className="text-lg font-semibold">No heroes yet</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                We haven&apos;t imported any of your matches yet. Your{" "}
                <Link href="/dashboard" className="text-gold hover:underline">
                  overview
                </Link>{" "}
                starts the import.
              </p>
            </section>
          ) : (
            <HeroGrid rows={rows} heroes={heroes} now={new Date()} />
          )}
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<SectionSkeleton label="Loading hero suggestions" rows={3} />}>
            <PoolAdvice accountId32={user.accountId32} heroes={heroes} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label="Loading where you play" rows={5} />}>
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
  const res = await (await getHeroesService()).laneBreakdown(accountId32).catch((e: unknown) => {
    logger.error("heroes_lanes_failed", { error: e });
    return { ok: false as const, error: { type: "error" as const } };
  });
  if (!res.ok)
    return (
      <MetaSection id="lane-breakdown" kicker="Lanes and roles" title="Where you play">
        <Unavailable>{unavailableCopy(res.error, "lane data")}</Unavailable>
      </MetaSection>
    );
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
