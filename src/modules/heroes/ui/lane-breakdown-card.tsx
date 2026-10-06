import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { MIN_POSITION_GAMES, POSITION_INFO } from "@/modules/meta/domain/position";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import type { LaneBreakdownView } from "../dtos/responses/heroes.dto";

/** How much of the sample could be placed, in plain words. */
function sampleLine(view: LaneBreakdownView, t: Translator<Messages>): string {
  const b = view.breakdown;
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const parts = [
    t("heroes.lanes.sampleLast", { games: games(b.total), days: view.windowDays }),
    t("heroes.lanes.samplePlaced", { n: b.counted }),
    t("heroes.lanes.sampleNoLane", { games: games(b.noLaneData) }),
  ];
  if (b.unplaced > 0) parts.push(t("heroes.lanes.sampleUnplaced", { games: games(b.unplaced) }));
  return `${parts.join(" · ")}. ${t("heroes.lanes.sampleSource")}`;
}

/**
 * Where you actually play (positions 1–5) and your win rate in each. `full` adds the heroes
 * you play in each position.
 */
export async function LaneBreakdownCard({
  view,
  heroes,
  full = false,
}: {
  view: LaneBreakdownView;
  heroes?: Map<number, HeroInfo>;
  full?: boolean;
}) {
  const t = await getT();
  const b = view.breakdown;
  const played = b.positions.filter((p) => p.games > 0);
  return (
    <MetaSection
      id="lane-breakdown"
      kicker={t("heroes.lanes.kicker")}
      title={t("heroes.lanes.title")}
      footer={sampleLine(view, t)}
    >
      {played.length === 0 ? (
        <Unavailable>
          {b.total === 0
            ? t("heroes.lanes.noPublicGames", { days: view.windowDays })
            : t("heroes.lanes.noLaneData")}
        </Unavailable>
      ) : (
        <ul className="space-y-3 px-5 pb-4" aria-label={t("heroes.lanes.listLabel")}>
          {b.positions.map((p) => {
            const info = POSITION_INFO[p.position];
            const share = b.counted > 0 ? p.games / b.counted : 0;
            return (
              <li key={p.position} className={cn("space-y-1.5", p.games === 0 && "opacity-50")}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{info.short}</span>{" "}
                    <span className="text-muted-foreground">
                      {info.name} ·{" "}
                      {t("heroes.lanes.placedShare", { pct: Math.round(share * 100) })}
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {p.games === 0 ? (
                      t("heroes.lanes.noGames")
                    ) : (
                      <>
                        <span
                          className={cn(
                            p.lowSample ? "text-muted-foreground" : "font-semibold text-foreground",
                          )}
                        >
                          {formatPercent(p.winRate)}
                        </span>{" "}
                        · {plural(t, "heroes.counts.games", p.games)}
                        {p.lowSample && ` · ${t("heroes.tooFewToJudge")}`}
                      </>
                    )}
                  </span>
                </div>
                <WinRateBar rate={p.winRate} muted={p.lowSample} className="h-1.5" />
                {full && heroes && p.heroes.length > 0 && (
                  <ul
                    className="flex flex-wrap gap-2 pt-1"
                    aria-label={t("heroes.lanes.heroesAs", { pos: info.short })}
                  >
                    {p.heroes.slice(0, 6).map((h) => {
                      const hero = heroes.get(h.heroId);
                      return (
                        <li key={h.heroId}>
                          <Link
                            href={`/heroes/${h.heroId}`}
                            className="flex items-center gap-2 rounded-md border border-white/[0.06] py-1 pr-2 pl-1 text-xs hover:border-gold/30"
                          >
                            <HeroPortrait hero={hero} heroId={h.heroId} size="xs" />
                            {heroName(hero, h.heroId)}
                            <span className="text-muted-foreground tabular-nums">{h.games}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {played.length > 0 && (
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          {t("heroes.lanes.faded", { n: MIN_POSITION_GAMES })}
        </p>
      )}
    </MetaSection>
  );
}
