import type { HeroInfo } from "../application/ports";
import type { MatchSummary } from "../domain/match-summary";
import { formatPercent } from "./format";
import { HeroPortrait, heroName } from "./hero-portrait";
import { WinRateBar } from "./win-rate-bar";

export function TopHeroesCard({
  summary,
  heroes,
}: {
  summary: MatchSummary;
  heroes: Map<number, HeroInfo>;
}) {
  return (
    <section className="panel p-5" aria-labelledby="top-heroes">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="kicker">Hero pool</p>
          <h2 id="top-heroes" className="text-lg font-semibold">
            Most played
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {summary.distinctHeroes} heroes played
        </span>
      </div>
      <ul className="space-y-1">
        {summary.heroes.map((h) => {
          const hero = heroes.get(h.heroId);
          return (
            <li
              key={h.heroId}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]"
            >
              <HeroPortrait hero={hero} heroId={h.heroId} size="md" />
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{heroName(hero, h.heroId)}</span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {h.games} games
                  </span>
                </div>
                <WinRateBar rate={h.winRate} muted={h.lowSample} className="h-1.5" />
              </div>
              <div className="w-16 text-right">
                <div className="text-sm font-semibold tabular-nums">{formatPercent(h.winRate)}</div>
                <div className="text-[0.7rem] text-muted-foreground tabular-nums">
                  {h.kda.toFixed(2)} KDA
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
