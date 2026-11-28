import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { PageHeader } from "@/components/page-header";
import { heroesService } from "@/modules/heroes";
import { DeathHabitsView } from "@/modules/heroes/ui/death-habits";
import { getCurrentUser } from "@/modules/identity";
import { matchQueries, matchesService } from "@/modules/matches";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.deaths.metaTitle") };
}

function parseHero(value: unknown): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || !/^[1-9]\d{0,3}$/.test(v)) return undefined;
  return Number(v);
}

/** Your deaths: when in the game you die and which heroes kill you (free). */
export default async function DeathsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const heroId = parseHero((await searchParams).hero);

  const [played, heroes, habits] = await Promise.all([
    matchQueries.playedHeroes(user.accountId32),
    matchesService.heroMap(),
    heroesService.deaths(user.accountId32, { heroId }),
  ]);
  const heroOptions = played.map((p) => ({
    heroId: p.heroId,
    games: p.games,
    name: heroName(heroes.get(p.heroId), p.heroId),
  }));
  const hrefFor: Record<string, string> = { all: "/heroes/deaths" };
  for (const o of heroOptions) hrefFor[String(o.heroId)] = `/heroes/deaths?hero=${o.heroId}`;

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
        kicker={t("heroes.deaths.kicker")}
        title={t("heroes.deaths.title")}
        description={t("heroes.deaths.description")}
      />
      {heroOptions.length > 0 && (
        <HeroFilter options={heroOptions} value={heroId} hrefFor={hrefFor} />
      )}
      {habits.games === 0 ? (
        <p role="status" className="panel p-5 text-sm text-muted-foreground">
          {t("heroes.deaths.none")}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {t("heroes.deaths.gamesRead", {
              games: plural(t, "heroes.counts.games", habits.games),
            })}
          </p>
          <DeathHabitsView habits={habits} heroes={heroes} />
          <p className="text-xs text-muted-foreground">{t("heroes.deaths.footnote")}</p>
        </>
      )}
    </div>
  );
}
