import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ESTIMATE_PER_GAME } from "../domain/calendar";
import type { HeroClimb } from "../domain/hero-climb";

const SHOWN = 10;

function signed(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;
}

/** Cumulative estimated climb, starting from zero. Static: no claim between games. */
function Sparkline({ path, label }: { path: number[]; label: string }) {
  const w = 96;
  const h = 28;
  const values = [0, ...path];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, ESTIMATE_PER_GAME);
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4);
  const last = values.at(-1)!;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${w} ${h}`}
      className="h-7 w-14 shrink-0 sm:w-24"
      preserveAspectRatio="none"
    >
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="stroke-white/15" strokeDasharray="2 3" />
      <polyline
        points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        strokeWidth={1.75}
        strokeLinejoin="round"
        className={last > 0 ? "stroke-win" : last < 0 ? "stroke-loss" : "stroke-muted-foreground"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HeroClimbSection({
  climbs,
  heroes,
  periodLabel,
}: {
  climbs: HeroClimb[];
  heroes: Map<number, HeroInfo>;
  periodLabel: string;
}) {
  const shown = climbs.slice(0, SHOWN);
  const anyExact = climbs.some((c) => c.exact);
  return (
    <section className="panel overflow-hidden" aria-labelledby="hero-climb-title">
      <div className="p-5 pb-3">
        <p className="kicker">{periodLabel}</p>
        <h2 id="hero-climb-title" className="text-lg font-semibold">
          Climb by hero
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dota doesn&apos;t report MMR per hero, so each hero&apos;s climb is an estimate of ±
          {ESTIMATE_PER_GAME} per ranked game.{" "}
          {anyExact
            ? "Exact figures come from your own entries, when every game between two of them was on one hero."
            : "Log your MMR before and after a run of games on one hero to see its exact change."}
        </p>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No ranked games in this period.</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {shown.map((c) => {
            const hero = heroes.get(c.heroId);
            const name = heroName(hero, c.heroId);
            return (
              <li key={c.heroId}>
                <Link
                  href={`/heroes/${c.heroId}`}
                  aria-label={`${name}: ${c.wins} wins, ${c.losses} losses, about ${signed(c.estimatedNet)} MMR (estimate)`}
                  className="group flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/[0.03] sm:gap-3 sm:px-5"
                >
                  <HeroPortrait
                    hero={hero}
                    heroId={c.heroId}
                    size="xs"
                    className="sm:h-8 sm:w-[3.56rem]"
                    displayWidth={57}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:text-gold">
                      {name}
                    </span>
                    <span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      {c.wins}–{c.losses} · {c.games} {c.games === 1 ? "game" : "games"}
                    </span>
                  </span>
                  <Sparkline path={c.path} label={`${name} estimated climb, game by game`} />
                  <span className="shrink-0 text-right tabular-nums sm:w-24">
                    <span
                      className={cn(
                        "block text-sm font-semibold",
                        c.estimatedNet > 0 ? "text-win" : c.estimatedNet < 0 ? "text-loss" : "",
                      )}
                    >
                      ≈ {signed(c.estimatedNet)}
                    </span>
                    {c.exact && (
                      <span className="block text-xs text-muted-foreground">
                        Exact {signed(c.exact.delta)} / {c.exact.games}
                        {c.exact.games === 1 ? " game" : " games"}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {climbs.length > SHOWN && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {climbs.length - SHOWN} more {climbs.length - SHOWN === 1 ? "hero" : "heroes"} with fewer
          games not shown.
        </p>
      )}
    </section>
  );
}
