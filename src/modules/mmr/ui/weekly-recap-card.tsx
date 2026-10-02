import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { HeroWeek, WeeklyRecap } from "../domain/weekly-recap";

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;

function Hero({ label, h, heroes }: { label: string; h: HeroWeek; heroes: Map<number, HeroInfo> }) {
  const hero = heroes.get(h.heroId);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">
          {heroName(hero, h.heroId)}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            {h.wins}–{h.games - h.wins}
          </span>
        </p>
      </div>
    </div>
  );
}

/** This week's ranked games against last week's, with the MMR change. */
export function WeeklyRecapCard({
  recap,
  heroes,
  rangeLabel,
}: {
  recap: WeeklyRecap;
  heroes: Map<number, HeroInfo>;
  rangeLabel: string;
}) {
  const { thisWeek: w, lastWeek: l, mmr } = recap;
  const delta = w.winRate !== null && l.winRate !== null ? w.winRate - l.winRate : null;
  const mmrValue = mmr.exact ?? (w.games > 0 ? mmr.estimate : null);
  return (
    <section className="panel p-5" aria-labelledby="week-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="kicker">{rangeLabel}</p>
          <h2 id="week-title" className="text-lg font-semibold">
            This week
          </h2>
        </div>
        <Link
          href="/mmr?view=week"
          className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
        >
          Week in the MMR journal <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>

      {w.games === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ranked games yet this week.
          {l.games > 0 && ` Last week: ${l.wins}–${l.losses} (${formatPercent(l.winRate)}).`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Ranked</p>
            <p className="text-xl font-semibold tabular-nums">
              <span className="text-win">{w.wins}W</span>–
              <span className="text-loss">{w.losses}L</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win rate</p>
            <p className="text-xl font-semibold tabular-nums">{formatPercent(w.winRate)}</p>
            <p className="text-xs text-muted-foreground">
              {l.games === 0
                ? "No ranked games last week"
                : delta === 0
                  ? "Same as last week"
                  : `${delta !== null && delta > 0 ? "Up" : "Down"} from ${formatPercent(l.winRate)} last week`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MMR</p>
            <p
              className={cn(
                "text-xl font-semibold tabular-nums",
                mmrValue !== null && mmrValue > 0 && "text-win",
                mmrValue !== null && mmrValue < 0 && "text-loss",
              )}
            >
              {mmrValue === null ? "—" : `${mmr.exact === null ? "≈ " : ""}${signed(mmrValue)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {mmr.exact !== null ? "Exact, from your entries" : "Estimate: ±25 per game"}
            </p>
          </div>
          <div className="col-span-2 space-y-2 sm:col-span-1">
            {recap.mostPlayed && <Hero label="Most played" h={recap.mostPlayed} heroes={heroes} />}
            {recap.best && recap.best.heroId !== recap.mostPlayed?.heroId && (
              <Hero label="Best" h={recap.best} heroes={heroes} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
