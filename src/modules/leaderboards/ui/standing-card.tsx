import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { StandingView } from "../dtos/responses/leaderboard-views.dto";
import { BOARD_LABEL, BOARD_UNIT, leaderboardHref } from "./copy";

function Heading() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="kicker">Leaderboards</p>
        <h2 className="text-lg font-semibold">Your standing among friends</h2>
      </div>
      <Trophy aria-hidden className="size-5 text-gold" />
    </div>
  );
}

/** The overview's small "Your standing" card: your all-time rank on each friends board. */
export function StandingCard({ standings }: { standings: StandingView[] }) {
  return (
    <section aria-label="Your standing" className="panel space-y-3 p-5">
      <Heading />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {standings.map((s) => {
          const [one, many] = BOARD_UNIT[s.kind];
          return (
            <li key={s.kind}>
              <Link
                href={leaderboardHref({ board: s.kind, scope: "friends", period: "all" })}
                className="group flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
              >
                <span className="font-display text-2xl font-bold text-gold tabular-nums">
                  {s.rank === null ? "—" : `#${s.rank}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-gold">
                    {BOARD_LABEL[s.kind]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {s.rank === null
                      ? "Not played yet"
                      : `${s.value} ${s.value === 1 ? one : many} · ${s.players} ${s.players === 1 ? "player" : "players"}`}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-gold"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StandingUnavailable() {
  return (
    <section aria-label="Your standing" className="panel space-y-2 p-5">
      <Heading />
      <p role="alert" className="text-sm text-muted-foreground">
        Your standing is unavailable right now. The rest of your overview is unaffected.
      </p>
    </section>
  );
}

export function StandingSkeleton() {
  return <Skeleton className="h-32 rounded-2xl" aria-label="Loading your standing" />;
}
