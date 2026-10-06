import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import type { TopHeroesView } from "../dtos/responses/meta.dto";
import type { RankedHero } from "../domain/meta-stats";
import { TREND_THRESHOLD } from "../domain/patch-tips";
import { POSITION_INFO } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function TrendBadge({ hero }: { hero: RankedHero }) {
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
      title="Change in share of public picks, last 3 days vs earlier in the week"
    >
      <Icon aria-hidden className="size-3" />
      {rising ? "Rising" : "Falling"} {rising ? "+" : "−"}
      {pct(Math.abs(change))}
    </span>
  );
}

export function TopHeroesCard({
  view,
  catalog,
  now,
}: {
  view: TopHeroesView;
  catalog: Map<number, HeroInfo>;
  now: Date;
}) {
  const info = POSITION_INFO[view.position];
  const lane = info.laneName.replace(/^./, (c) => c.toUpperCase());
  const { sources } = view;
  const titleId = "meta-top-heroes";

  return (
    <MetaSection
      id={titleId}
      kicker="Right now"
      title={`Top heroes: ${info.name}`}
      description="Ranked by win rate at Ancient to Immortal and in this lane, with small samples pulled toward 50%, plus a small boost for heroes contested in tournaments."
      footer={
        <>
          High-rank and lane stats: OpenDota public games, updated{" "}
          {formatAgo(sources.publicFetchedAt, now)}.{" "}
          {sources.pro.status === "ok"
            ? `Tournaments: ${plural(sources.pro.drafts, "pro draft")} in the last ${sources.pro.windowDays} days, updated ${formatAgo(sources.pro.fetchedAt, now)}.`
            : sources.pro.status === "too_few"
              ? `Tournaments: only ${plural(sources.pro.drafts, "pro draft")} in the last ${sources.pro.windowDays} days, too few to use.`
              : "Tournament data is unavailable right now."}
        </>
      }
    >
      {sources.lane === "unavailable" && (
        <Unavailable>
          Lane data is unavailable right now, so this list can&apos;t check which lane each hero is
          played in. It uses the hero&apos;s usual role instead.
        </Unavailable>
      )}
      {view.heroes.length === 0 ? (
        <Unavailable>
          Not enough data to rank heroes for this role right now. Try again later.
        </Unavailable>
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
                    <TrendBadge hero={h} />
                  </div>
                  {h.highRank && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">
                        <span className="text-foreground">{formatPercent(h.highRank.rate)}</span>{" "}
                        win rate at high ranks · {plural(h.highRank.games, "game")}
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
                        <span className="text-foreground">{formatPercent(h.lane.rate)}</span> win
                        rate · {plural(h.lane.games, "game")} ({pct(h.lane.share)} of its games are
                        in this lane)
                      </>
                    ) : (
                      `${lane}: lane data unavailable`
                    )}
                  </p>
                  {h.pro && (
                    <p className="text-xs text-muted-foreground">
                      Tournaments: {plural(h.pro.picks, "pick")} · {plural(h.pro.bans, "ban")} in{" "}
                      {plural(h.pro.drafts, "pro draft")} ({pct(h.pro.contestRate)} contested)
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
