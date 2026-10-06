import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { formatAgo, plural } from "@/modules/matches/ui/format";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { FriendCandidate } from "../dtos/responses/together-views.dto";

/** The people you play with; each links to the pair's page. */
export function FriendList({
  friends,
  now,
  error,
}: {
  friends: FriendCandidate[];
  now: Date;
  /** Set when OpenDota's teammate list couldn't be loaded. */
  error?: string | null;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="friends">
      <div className="p-5 pb-3">
        <p className="kicker">Friends</p>
        <h2 id="friends" className="text-lg font-semibold">
          People you play with
        </h2>
        <p className="text-xs text-muted-foreground">
          Your most frequent teammates on OpenDota, plus players you track.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="border-t border-white/[0.06] px-5 py-4 text-sm text-muted-foreground"
        >
          {error}
        </p>
      )}
      {friends.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <UsersRound aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>
            No teammates yet. They show up here after a few public matches together. You can also{" "}
            <Link href="/players" className="text-gold hover:underline">
              track a friend
            </Link>{" "}
            to add them.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {friends.map((f) => {
            const name = displayName(f.personaName, f.accountId32);
            return (
              <li key={f.accountId32}>
                <Link
                  href={`/together/${f.accountId32}`}
                  className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                >
                  <PlayerAvatar url={f.avatarUrl} name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:text-gold">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {f.sameTeamGames !== null
                        ? `${plural(f.sameTeamGames, "game")} on your team`
                        : "Tracked player"}
                      {" · "}
                      {f.partyGames > 0 ? (
                        <span className="text-gold">
                          {plural(f.partyGames, "confirmed party game")}
                        </span>
                      ) : (
                        "no confirmed parties yet"
                      )}
                    </span>
                  </div>
                  {f.lastPlayedAt && (
                    <time
                      dateTime={f.lastPlayedAt.toISOString()}
                      className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                      title="Last played together or against"
                    >
                      {formatAgo(f.lastPlayedAt, now)}
                    </time>
                  )}
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground group-hover:text-gold"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
