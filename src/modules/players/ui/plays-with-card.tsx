import Link from "next/link";
import { Users } from "lucide-react";
import { cn } from "cn";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { winRate, type Peer } from "../domain/public-player";
import { displayName, PlayerAvatar } from "./player-avatar";

export function PlaysWithCard({
  peers,
  error,
  now,
}: {
  peers: Peer[];
  /** Set when the upstream couldn't be reached; replaces the empty state. */
  error?: string | null;
  now: Date;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="plays-with">
      <div className="p-5 pb-3">
        <p className="kicker">Teammates</p>
        <h2 id="plays-with" className="text-lg font-semibold">
          Plays with
        </h2>
        <p className="text-xs text-muted-foreground">
          People most often on the same team in public matches.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
        >
          {error}
        </p>
      ) : peers.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>No regular teammates yet. They show up here after a few public matches together.</p>
        </div>
      ) : (
        <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {peers.map((p) => {
            const name = displayName(p.personaName, p.accountId32);
            const rate = winRate(p.withWins, p.withGames);
            return (
              <li key={p.accountId32} className="flex items-center gap-3 px-5 py-3">
                <PlayerAvatar url={p.avatarUrl} name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${p.accountId32}`}
                    className="block truncate font-medium hover:text-gold focus-visible:text-gold focus-visible:outline-none"
                  >
                    {name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {plural(p.withGames, "game")} together ·{" "}
                    <span className={cn(rate !== null && (rate >= 0.5 ? "text-win" : "text-loss"))}>
                      {formatPercent(rate)}
                    </span>{" "}
                    win rate together
                  </p>
                </div>
                {p.lastPlayedAt && (
                  <time
                    dateTime={p.lastPlayedAt.toISOString()}
                    className="shrink-0 text-xs text-muted-foreground"
                    title="Last played together or against"
                  >
                    {formatAgo(p.lastPlayedAt, now)}
                  </time>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
