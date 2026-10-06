import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { winRate, type HeroUsage } from "../domain/public-player";

export function MostPlayedHeroesCard({
  heroes,
  catalog,
  error,
}: {
  heroes: HeroUsage[];
  catalog: Map<number, HeroInfo>;
  error?: string | null;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="most-played-heroes">
      <div className="p-5 pb-3">
        <p className="kicker">Heroes</p>
        <h2 id="most-played-heroes" className="text-lg font-semibold">
          Most played heroes
        </h2>
      </div>
      {error ? (
        <p
          role="alert"
          className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
        >
          {error}
        </p>
      ) : heroes.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          No public hero stats yet.
        </p>
      ) : (
        <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {heroes.map((h) => {
            const hero = catalog.get(h.heroId);
            const rate = winRate(h.wins, h.games);
            return (
              <li key={h.heroId} className="flex items-center gap-3 px-5 py-2.5">
                <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{heroName(hero, h.heroId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {plural(h.games, "game")} · {formatPercent(rate)} win rate
                  </p>
                </div>
                <span className="hidden w-20 sm:block">
                  <WinRateBar rate={rate} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
