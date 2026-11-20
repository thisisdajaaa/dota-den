import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getViewerTimeZone } from "@/common/http/request-context";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { heroesService } from "@/modules/heroes";
import { DeeperStatsView } from "@/modules/heroes/ui/deeper-stats";
import { getCurrentUser } from "@/modules/identity";
import { matchQueries, matchesService } from "@/modules/matches";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { plusService } from "@/modules/plus";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.splits.metaTitle") };
}

function parseHero(value: unknown): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^[1-9]\d{0,3}$/.test(v)) return undefined;
  return Number(v);
}

/** Plus: your record split by patch, position, time of day, length, lane result and partner. */
export default async function SplitsPage({ searchParams }: PageProps<"/heroes/splits">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const heroId = parseHero((await searchParams).hero);
  const plus = await plusService.isPlus(user.id).catch(() => false);

  const back = (
    <Link
      href="/heroes"
      className="relative inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t("heroes.own.back")}
    </Link>
  );
  const header = (
    <PageHeader
      kicker={t("heroes.splits.kicker")}
      title={t("heroes.splits.title")}
      description={t("heroes.splits.description")}
    />
  );

  if (!plus) {
    const onSale = plusService.offer().status === "available";
    return (
      <div className="space-y-6">
        {back}
        {header}
        <section aria-labelledby="splits-locked" className="panel space-y-2 p-5">
          <h2 id="splits-locked" className="text-base font-semibold">
            {t("heroes.splits.lockedTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("heroes.splits.locked")}{" "}
            {onSale && (
              <Link href="/plus" className="font-medium text-gold hover:underline">
                {t("heroes.splits.lockedLink")}
              </Link>
            )}
          </p>
        </section>
      </div>
    );
  }

  const [{ timeZone }, played, heroes] = await Promise.all([
    getViewerTimeZone(),
    matchQueries.playedHeroes(user.accountId32),
    matchesService.heroMap(),
  ]);
  const stats = await heroesService.splits(user.accountId32, { heroId, timeZone });
  const heroOptions = played.map((p) => ({
    heroId: p.heroId,
    games: p.games,
    name: heroName(heroes.get(p.heroId), p.heroId),
  }));
  const hrefFor: Record<string, string> = { all: "/heroes/splits" };
  for (const o of heroOptions) hrefFor[String(o.heroId)] = `/heroes/splits?hero=${o.heroId}`;

  return (
    <div className="space-y-6">
      {back}
      {header}
      {heroOptions.length > 0 && (
        <HeroFilter options={heroOptions} value={heroId} hrefFor={hrefFor} />
      )}
      <DeeperStatsView stats={stats} heroes={heroes} />
    </div>
  );
}
