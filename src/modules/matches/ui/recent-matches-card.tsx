import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { DashboardFact, HeroInfo } from "../application/ports";
import { formatAgo, formatDuration, queueLabel } from "./format";
import { HeroPortrait, heroName } from "./hero-portrait";

const COLS =
  "grid grid-cols-[1fr_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1.6fr)_4.5rem_6.5rem_5.5rem_4rem_4.5rem_1rem]";

export function RecentMatchesCard({
  matches,
  heroes,
  now,
}: {
  matches: DashboardFact[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="recent-matches">
      <div className="flex items-baseline justify-between p-5 pb-3">
        <div>
          <p className="kicker">Match history</p>
          <h2 id="recent-matches" className="text-lg font-semibold">
            Recent matches
          </h2>
        </div>
        <Link href="/matches" className="text-xs text-gold hover:underline">
          View all matches
        </Link>
      </div>
      <MatchRows matches={matches} heroes={heroes} now={now} />
    </section>
  );
}

/** Column header + clickable rows; shared by the dashboard and the match list. */
export function MatchRows({
  matches,
  heroes,
  now,
}: {
  matches: DashboardFact[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          COLS,
          "hidden border-y border-white/[0.06] px-5 py-2 text-[0.65rem] tracking-wider text-muted-foreground uppercase sm:grid",
        )}
      >
        <span>Hero</span>
        <span>Result</span>
        <span>K / D / A</span>
        <span>Queue</span>
        <span>Length</span>
        <span>Played</span>
        <span />
      </div>

      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06] sm:border-t-0">
        {matches.map((m) => {
          const hero = heroes.get(m.heroId);
          const win = m.result === "win";
          const name = heroName(hero, m.heroId);
          return (
            <li key={m.matchId}>
              <Link
                href={`/matches/${m.matchId}`}
                aria-label={`${win ? "Win" : "Loss"} as ${name}, ${m.kills}/${m.deaths}/${m.assists}, ${formatAgo(m.startedAt, now)}`}
                className={cn(
                  COLS,
                  "group relative px-5 py-2.5 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 left-0 w-0.5 rounded-r",
                    win ? "bg-win" : "bg-loss",
                  )}
                />
                <span className="flex min-w-0 items-center gap-3">
                  <HeroPortrait hero={hero} heroId={m.heroId} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block text-[0.7rem] text-muted-foreground">
                      {m.ranked ? "Ranked" : "Unranked"}
                      {m.patch && ` · ${m.patch}${m.patchCertainty === "boundary" ? "?" : ""}`}
                      <span className="sm:hidden">
                        {" · "}
                        {queueLabel(m.queueClass, m.partySize)} · {formatAgo(m.startedAt, now)}
                      </span>
                    </span>
                  </span>
                </span>

                {/* Mobile: result + KDA stacked on the right. */}
                <span className="text-right sm:hidden">
                  <span
                    className={cn("block text-xs font-semibold", win ? "text-win" : "text-loss")}
                  >
                    {win ? "Win" : "Loss"}
                  </span>
                  <span className="block text-xs tabular-nums">
                    {m.kills}/{m.deaths}/{m.assists}
                  </span>
                </span>

                <span className="hidden sm:block">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-xs font-semibold",
                      win ? "bg-win/15 text-win" : "bg-loss/15 text-loss",
                    )}
                  >
                    {win ? "Win" : "Loss"}
                  </span>
                </span>
                <span className="hidden text-sm tabular-nums sm:block">
                  {m.kills}
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-loss">{m.deaths}</span>
                  <span className="text-muted-foreground"> / </span>
                  {m.assists}
                </span>
                <span
                  className={cn(
                    "hidden text-xs sm:block",
                    m.queueClass === "unknown" && "text-muted-foreground italic",
                  )}
                >
                  {queueLabel(m.queueClass, m.partySize)}
                </span>
                <span className="hidden text-sm text-muted-foreground tabular-nums sm:block">
                  {formatDuration(m.durationSec)}
                </span>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  <time dateTime={m.startedAt.toISOString()}>{formatAgo(m.startedAt, now)}</time>
                </span>
                <ChevronRight
                  aria-hidden
                  className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold sm:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
