import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { RankedWeekView } from "../dtos/responses/leaderboard-views.dto";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)}`;

/** You and your friends' ranked games over the last 7 days, best net first. */
export function RankedWeekCard({
  view,
  heroes,
}: {
  view: RankedWeekView;
  heroes: Map<number, HeroInfo>;
}) {
  const notes = [
    view.idle > 0 && `${view.idle} didn't play ranked`,
    view.unknown > 0 && `${view.unknown} couldn't be read (private data or OpenDota busy)`,
  ].filter(Boolean);
  return (
    <section className="panel overflow-hidden" aria-labelledby="ranked-week-title">
      <div className="p-5 pb-3">
        <p className="kicker">Last 7 days</p>
        <h2 id="ranked-week-title" className="text-lg font-semibold">
          Ranked this week
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You and your friends (players you track, frequent teammates and room opponents), by ranked
          wins minus losses. MMR is the ±25-per-game estimate: Valve doesn&apos;t share real MMR.
        </p>
      </div>
      {view.rows.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          No ranked games from you or your friends in the last 7 days.
        </p>
      ) : (
        <ol className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {view.rows.map((r) => {
            const name = displayName(r.name, r.accountId32);
            const hero = r.bestHero ? heroes.get(r.bestHero.heroId) : undefined;
            return (
              <li
                key={r.accountId32}
                className={cn("flex items-center gap-3 px-5 py-2.5", r.you && "bg-gold/[0.05]")}
              >
                <span className="w-6 shrink-0 text-right text-sm font-semibold text-gold tabular-nums">
                  {r.rank}
                </span>
                <PlayerAvatar url={r.avatarUrl} name={name} size="sm" />
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/players/${r.accountId32}`}
                    className="block truncate text-sm font-medium hover:text-gold"
                  >
                    {name}
                    {r.you && <span className="ml-1.5 text-xs text-gold">(you)</span>}
                  </Link>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {r.wins}–{r.losses} · {formatPercent(r.winRate)}
                  </span>
                </span>
                {r.bestHero && (
                  <span
                    className="hidden items-center gap-2 sm:flex"
                    title={`Best this week: ${heroName(hero, r.bestHero.heroId)} ${r.bestHero.wins}–${r.bestHero.games - r.bestHero.wins}`}
                  >
                    <HeroPortrait hero={hero} heroId={r.bestHero.heroId} size="xs" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.bestHero.wins}–{r.bestHero.games - r.bestHero.wins}
                    </span>
                  </span>
                )}
                <span
                  className={cn(
                    "w-16 shrink-0 text-right text-sm font-semibold tabular-nums",
                    r.estimatedNet > 0 ? "text-win" : r.estimatedNet < 0 ? "text-loss" : "",
                  )}
                >
                  ≈ {signed(r.estimatedNet)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {(notes.length > 0 || view.friendsIncomplete) && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {[...notes, view.friendsIncomplete && "some friends couldn't be loaded"]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
    </section>
  );
}
