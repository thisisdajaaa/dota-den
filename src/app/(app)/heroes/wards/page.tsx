import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { minimapAt } from "@/components/minimap";
import { PageHeader } from "@/components/page-header";
import { heroesService } from "@/modules/heroes";
import { RuneHabitsView } from "@/modules/heroes/ui/rune-habits";
import { WardHabitsView } from "@/modules/heroes/ui/ward-habits";
import { getCurrentUser } from "@/modules/identity";
import { matchQueries, matchesService } from "@/modules/matches";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.wards.metaTitle") };
}

function parseHero(value: unknown): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^[1-9]\d{0,3}$/.test(v)) return undefined;
  return Number(v);
}

/** Wards and runes: where and when you ward, how long your observers last, which runes you take (free). */
export default async function WardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const heroId = parseHero((await searchParams).hero);

  const [played, heroes, wards] = await Promise.all([
    matchQueries.playedHeroes(user.accountId32),
    matchesService.heroMap(),
    heroesService.wards(user.accountId32, { heroId }),
  ]);
  const heroOptions = played.map((p) => ({
    heroId: p.heroId,
    games: p.games,
    name: heroName(heroes.get(p.heroId), p.heroId),
  }));
  const hrefFor: Record<string, string> = { all: "/heroes/wards" };
  for (const o of heroOptions) hrefFor[String(o.heroId)] = `/heroes/wards?hero=${o.heroId}`;
  const { habits, spots, runes } = wards;

  return (
    <div className="space-y-6">
      <Link
        href="/heroes"
        className="relative inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("heroes.own.back")}
      </Link>
      <PageHeader
        kicker={t("heroes.wards.kicker")}
        title={t("heroes.wards.title")}
        description={t("heroes.wards.description")}
      />
      {heroOptions.length > 0 && (
        <HeroFilter options={heroOptions} value={heroId} hrefFor={hrefFor} />
      )}
      {habits.games === 0 ? (
        <p role="status" className="panel p-5 text-sm text-muted-foreground">
          {t("heroes.wards.none")}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {t("heroes.wards.gamesRead", {
              games: plural(t, "heroes.counts.games", habits.games),
              warded: habits.gamesWarded,
            })}
          </p>
          <WardHabitsView
            habits={habits}
            spots={spots}
            mapImage={minimapAt(new Date())?.src ?? null}
          />
          <RuneHabitsView runes={runes} />
          <p className="text-xs text-muted-foreground">{t("heroes.wards.footnote")}</p>
        </>
      )}
    </div>
  );
}
