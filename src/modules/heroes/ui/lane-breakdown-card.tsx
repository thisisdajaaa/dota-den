import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { MIN_POSITION_GAMES, POSITION_INFO } from "@/modules/meta";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import type { LaneBreakdownView } from "../dtos/responses/heroes.dto";

/** How much of the sample could be placed, in plain words. */
function sampleLine(view: LaneBreakdownView): string {
  const b = view.breakdown;
  const parts = [
    `Your last ${plural(b.total, "game")} from the past ${view.windowDays} days`,
    `${b.counted} placed in a position`,
    `${plural(b.noLaneData, "game")} with no lane data`,
  ];
  if (b.unplaced > 0) parts.push(`${plural(b.unplaced, "game")} whose position couldn't be read`);
  return `${parts.join(" · ")}. Positions come from OpenDota's lane data (parsed replays) and the hero's roles.`;
}

/**
 * Where you actually play (positions 1–5) and your win rate in each. `full` adds the heroes
 * you play in each position.
 */
export function LaneBreakdownCard({
  view,
  heroes,
  full = false,
}: {
  view: LaneBreakdownView;
  heroes?: Map<number, HeroInfo>;
  full?: boolean;
}) {
  const b = view.breakdown;
  const played = b.positions.filter((p) => p.games > 0);
  return (
    <MetaSection
      id="lane-breakdown"
      kicker="Lanes and roles"
      title="Where you play"
      footer={sampleLine(view)}
    >
      {played.length === 0 ? (
        <Unavailable>
          {b.total === 0
            ? `No public games in the past ${view.windowDays} days.`
            : "None of your recent games has lane data yet. OpenDota only knows lanes for parsed replays."}
        </Unavailable>
      ) : (
        <ul className="space-y-3 px-5 pb-4" aria-label="Positions">
          {b.positions.map((p) => {
            const info = POSITION_INFO[p.position];
            const share = b.counted > 0 ? p.games / b.counted : 0;
            return (
              <li key={p.position} className={cn("space-y-1.5", p.games === 0 && "opacity-50")}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{info.short}</span>{" "}
                    <span className="text-muted-foreground">
                      {info.name} · {Math.round(share * 100)}% of placed games
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {p.games === 0 ? (
                      "No games"
                    ) : (
                      <>
                        <span
                          className={cn(
                            p.lowSample ? "text-muted-foreground" : "font-semibold text-foreground",
                          )}
                        >
                          {formatPercent(p.winRate)}
                        </span>{" "}
                        · {plural(p.games, "game")}
                        {p.lowSample && " · too few to judge"}
                      </>
                    )}
                  </span>
                </div>
                <WinRateBar rate={p.winRate} muted={p.lowSample} className="h-1.5" />
                {full && heroes && p.heroes.length > 0 && (
                  <ul className="flex flex-wrap gap-2 pt-1" aria-label={`Heroes as ${info.short}`}>
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
          Win rates under {MIN_POSITION_GAMES} games are shown faded: too few to judge.
        </p>
      )}
    </MetaSection>
  );
}
