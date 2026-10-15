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
import { plural } from "@/common/i18n/translate";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import { GAP_DAYS } from "@/modules/mmr/domain/journey";
import { JourneyChart } from "@/modules/mmr/ui/journey-chart";
import { JourneyStretchCard } from "@/modules/mmr/ui/journey-stretch-card";
import { winRate, type JourneyShareStretch, type ShareHero } from "@/modules/shares/domain/share";
import { shareHeadline } from "@/modules/shares/ui/share-text";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const share = await sharesService.view(slug);
  // Shared on purpose, but not something to put in search results.
  const robots = { index: false, follow: false };
  if (!share) return { robots };
  const t = await getT();
  const { title, games } = shareHeadline(t, share.snapshot, share.playerName);
  // ?v= changes when the owner shares again, so previews pick up the new snapshot.
  const images = [
    { url: `/og/share/${slug}?v=${share.updatedAt.getTime()}`, width: 1200, height: 630 },
  ];
  return {
    title,
    description: games,
    robots,
    openGraph: { title, description: games, images },
    twitter: { card: "summary_large_image", title, description: games, images },
  };
}

const dateRange = (from: Date, to: Date) => {
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return fmt.formatRange(from, to);
};

const medalName = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : String(tier);
};

/**
 * A session, a week or a rank journey a player chose to share. Only the snapshot they shared is
 * shown; a journey is by medal only (never MMR).
 */
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
      : s.kind === "journey"
        ? t("shares.journey.kicker", { date: dateRange(s.from, s.to) })
        : t("shares.week.kicker", {
            date: dateRange(new Date(`${s.from}T12:00:00Z`), new Date(`${s.to}T12:00:00Z`)),
          });

  const cta = (
    <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="text-sm text-muted-foreground">{t("shares.cta.text")}</p>
      <Button asChild>
        <Link href="/">{t("shares.cta.action")}</Link>
      </Button>
    </section>
  );

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
    s.kind === "session" || s.kind === "journey"
      ? s.heroes.map((h) => heroRow(t("shares.played"), h))
      : [
          ...(s.mostPlayed ? [heroRow(t("shares.week.mostPlayed"), s.mostPlayed)] : []),
          ...(s.best ? [heroRow(t("shares.week.best"), s.best)] : []),
        ];

  if (s.kind === "journey") {
    const day = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const stretch = (x: JourneyShareStretch | null, sign: "+" | "−") =>
      x && {
        from: x.from,
        to: x.to,
        change: `${medalName(x.fromTier)} → ${medalName(x.toTier)}`,
        amount: `${sign}${plural(t, "shares.journey.stars", Math.abs(x.steps))}`,
        games: x.games,
        wins: x.wins,
        losses: x.losses,
        heroes: x.heroes,
      };
    return (
      <div className="space-y-6">
        <PageHeader kicker={kicker} title={title} description={games} />
        <section aria-label={t("shares.summary")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label={t("mmr.journey.medalPeak")}
            value={s.peak ? medalName(s.peak.rankTier) : "—"}
            tone="gold"
          />
          <StatTile
            label={t("mmr.journey.medalLow")}
            value={s.low ? medalName(s.low.rankTier) : "—"}
          />
          <StatTile
            label={t("shares.journey.games")}
            value={s.games ? t("shares.record", { wins: s.wins, losses: s.losses }) : "—"}
          />
          <StatTile label={t("shares.winRate")} value={formatPercent(winRate(s))} />
        </section>
        <section className="panel space-y-3 p-5" aria-labelledby="share-medals">
          <h2 id="share-medals" className="text-lg font-semibold">
            {t("shares.journey.medals")}
          </h2>
          <JourneyChart
            from={s.from.getTime()}
            to={s.to.getTime()}
            medals={s.medals.map((m) => ({
              t: m.at.getTime(),
              rankTier: m.rankTier,
              label: medalName(m.rankTier),
              dateLabel: day.format(m.at),
            }))}
            medalEnd={s.lastSeenAt?.getTime() ?? null}
            entries={null}
            gapDays={GAP_DAYS}
            bands={[
              ...(s.climb
                ? [
                    {
                      from: s.climb.from.getTime(),
                      to: s.climb.to.getTime(),
                      tone: "win" as const,
                      lane: "medal" as const,
                    },
                  ]
                : []),
              ...(s.slide
                ? [
                    {
                      from: s.slide.from.getTime(),
                      to: s.slide.to.getTime(),
                      tone: "loss" as const,
                      lane: "medal" as const,
                    },
                  ]
                : []),
            ]}
            ariaLabel={t("shares.journey.chart", {
              from: day.format(s.from),
              to: day.format(s.to),
              medals: plural(t, "mmr.journey.medalCount", s.medals.length),
            })}
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {s.medals.map((m) => (
              <li key={m.at.toISOString()}>
                <span className="font-medium text-foreground">{medalName(m.rankTier)}</span>{" "}
                {m.carried
                  ? t("mmr.journey.heldSince", { date: day.format(m.at) })
                  : t("mmr.journey.reached", { date: day.format(m.at) })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("shares.journey.medalOnly")}</p>
        </section>
        <div className="grid gap-3 md:grid-cols-2">
          <JourneyStretchCard
            title={t("shares.journey.climb")}
            tone="win"
            stretch={stretch(s.climb, "+")}
            emptyText={t("shares.journey.noClimb")}
            heroes={heroes}
            timeZone="UTC"
          />
          <JourneyStretchCard
            title={t("shares.journey.slide")}
            tone="loss"
            stretch={stretch(s.slide, "−")}
            emptyText={t("shares.journey.noSlide")}
            heroes={heroes}
            timeZone="UTC"
          />
        </div>
        {heroList.length > 0 && (
          <section className="panel p-5" aria-labelledby="share-heroes">
            <h2 id="share-heroes" className="mb-3 text-lg font-semibold">
              {t("shares.journey.heroes")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">{heroList}</ul>
          </section>
        )}
        {cta}
      </div>
    );
  }

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
      {cta}
    </div>
  );
}
