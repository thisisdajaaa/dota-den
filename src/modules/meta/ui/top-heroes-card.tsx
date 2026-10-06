import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import type { TopHeroesView } from "../dtos/responses/meta.dto";
import type { RankedHero } from "../domain/meta-stats";
import { TREND_THRESHOLD } from "../domain/patch-tips";
import { POSITION_INFO } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function TrendBadge({ hero, t }: { hero: RankedHero; t: Translator<Messages> }) {
  const change = hero.trend?.change;
  if (change === undefined || Math.abs(change) < TREND_THRESHOLD) return null;
  const rising = change > 0;
  const Icon = rising ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        rising
          ? "inline-flex items-center gap-1 rounded-full bg-win/10 px-2 py-0.5 text-[0.65rem] font-semibold text-win"
          : "inline-flex items-center gap-1 rounded-full bg-loss/10 px-2 py-0.5 text-[0.65rem] font-semibold text-loss"
      }
      title={t("meta.topHeroes.trendTitle")}
    >
      <Icon aria-hidden className="size-3" />
      {rising ? t("meta.topHeroes.rising") : t("meta.topHeroes.falling")} {rising ? "+" : "−"}
      {pct(Math.abs(change))}
    </span>
  );
}

export async function TopHeroesCard({
  view,
  catalog,
  now,
}: {
  view: TopHeroesView;
  catalog: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "meta.counts.games", n);
  const drafts = (n: number) => plural(t, "meta.counts.proDrafts", n);
  const info = POSITION_INFO[view.position];
  const lane = info.laneName.replace(/^./, (c) => c.toUpperCase());
  const { sources } = view;
  const titleId = "meta-top-heroes";

  return (
    <MetaSection
      id={titleId}
      kicker={t("meta.topHeroes.kicker")}
      title={t("meta.topHeroes.title", { name: info.name })}
      description={t("meta.topHeroes.description")}
      footer={
        <>
          {t("meta.topHeroes.publicSource", { ago: formatAgo(sources.publicFetchedAt, now) })}{" "}
          {sources.pro.status === "ok"
            ? t("meta.topHeroes.proOk", {
                drafts: drafts(sources.pro.drafts),
                days: sources.pro.windowDays,
                ago: formatAgo(sources.pro.fetchedAt, now),
              })
            : sources.pro.status === "too_few"
              ? t("meta.topHeroes.proTooFew", {
                  drafts: drafts(sources.pro.drafts),
                  days: sources.pro.windowDays,
                })
              : t("meta.topHeroes.proUnavailable")}
        </>
      }
    >
      {sources.lane === "unavailable" && (
        <Unavailable>{t("meta.topHeroes.laneUnavailable")}</Unavailable>
      )}
      {view.heroes.length === 0 ? (
        <Unavailable>{t("meta.topHeroes.notEnough")}</Unavailable>
      ) : (
        <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {view.heroes.map((h, i) => {
            const hero = catalog.get(h.heroId);
            return (
              <li key={h.heroId} className="flex gap-3 px-5 py-3">
                <span className="w-5 pt-2 text-right text-sm font-semibold text-gold tabular-nums">
                  {i + 1}
                </span>
                <HeroPortrait hero={hero} heroId={h.heroId} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/guides/${h.heroId}`}
                      className="font-medium hover:text-gold hover:underline"
                    >
                      {heroName(hero, h.heroId)}
                    </Link>
                    <TrendBadge hero={h} t={t} />
                  </div>
                  {h.highRank && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground">{formatPercent(h.highRank.rate)}</span>{" "}
                        {t("meta.topHeroes.highRank", { games: games(h.highRank.games) })}
                      </p>
                      <span className="hidden w-20 sm:block">
                        <WinRateBar rate={h.highRank.rate} />
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {h.lane ? (
                      <>
                        {lane}:{" "}
                        <span className="text-foreground">{formatPercent(h.lane.rate)}</span>{" "}
                        {t("meta.topHeroes.laneRate", {
                          games: games(h.lane.games),
                          share: pct(h.lane.share),
                        })}
                      </>
                    ) : (
                      t("meta.topHeroes.laneNoData", { lane })
                    )}
                  </p>
                  {h.pro && (
                    <p className="text-xs text-muted-foreground">
                      {t("meta.topHeroes.tournaments", {
                        picks: plural(t, "meta.counts.picks", h.pro.picks),
                        bans: plural(t, "meta.counts.bans", h.pro.bans),
                        drafts: drafts(h.pro.drafts),
                        contest: pct(h.pro.contestRate),
                      })}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </MetaSection>
  );
}
