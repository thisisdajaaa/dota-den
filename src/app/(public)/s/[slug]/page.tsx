import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { matchesService } from "@/modules/matches";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { sharesService } from "@/modules/shares";
import { winRate, type ShareHero } from "@/modules/shares/domain/share";
import { shareHeadline } from "@/modules/shares/ui/share-text";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const share = await sharesService.view(slug);
  // Shared on purpose, but not something to put in search results.
  const robots = { index: false, follow: false };
  if (!share) return { robots };
  const t = await getT();
  const { title, games } = shareHeadline(t, share.snapshot, share.playerName);
  return { title, description: games, robots, openGraph: { title, description: games } };
}

const dateRange = (from: Date, to: Date) => {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return fmt.formatRange(from, to);
};

/** A session or a week a player chose to share. Only the snapshot they shared is shown. */
export default async function SharePage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const share = await sharesService.view(slug);
  if (!share) notFound();
  const [t, heroes] = await Promise.all([getT(), matchesService.heroMap()]);
  const s = share.snapshot;
  const { title, games } = shareHeadline(t, s, share.playerName);
  const kicker =
    s.kind === "session"
      ? t("shares.session.kicker", { date: dateRange(s.startedAt, s.endedAt) })
      : t("shares.week.kicker", {
          date: dateRange(new Date(`${s.from}T12:00:00Z`), new Date(`${s.to}T12:00:00Z`)),
        });

  const heroRow = (label: string, h: ShareHero) => (
    <li key={`${label}-${h.heroId}`} className="flex items-center gap-3">
      <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">
          {heroName(heroes.get(h.heroId), h.heroId)}{" "}
          <span className="text-muted-foreground tabular-nums">
            {t("shares.record", { wins: h.wins, losses: h.games - h.wins })}
          </span>
        </p>
      </div>
    </li>
  );

  const heroList =
    s.kind === "session"
      ? s.heroes.map((h) => heroRow(t("shares.played"), h))
      : [
          ...(s.mostPlayed ? [heroRow(t("shares.week.mostPlayed"), s.mostPlayed)] : []),
          ...(s.best ? [heroRow(t("shares.week.best"), s.best)] : []),
        ];

  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} description={games} />
      <section aria-label={t("shares.summary")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("shares.wins")} value={String(s.wins)} />
        <StatTile label={t("shares.losses")} value={String(s.losses)} />
        <StatTile label={t("shares.winRate")} value={formatPercent(winRate(s))} />
        {s.kind === "session" && s.best && (
          <StatTile
            label={t("shares.session.best")}
            value={`${s.best.kills}/${s.best.deaths}/${s.best.assists}`}
            detail={heroName(heroes.get(s.best.heroId), s.best.heroId)}
          />
        )}
      </section>
      {heroList.length > 0 && (
        <section className="panel p-5" aria-labelledby="share-heroes">
          <h2 id="share-heroes" className="mb-3 text-lg font-semibold">
            {t("shares.heroes")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">{heroList}</ul>
        </section>
      )}
      <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted-foreground">{t("shares.cta.text")}</p>
        <Button asChild>
          <Link href="/">{t("shares.cta.action")}</Link>
        </Button>
      </section>
    </div>
  );
}
