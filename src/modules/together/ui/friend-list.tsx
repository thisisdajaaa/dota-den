import Link from "next/link";
import { ChevronRight, UsersRound } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatAgo } from "@/modules/matches/ui/format";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { FriendCandidate } from "../dtos/responses/together-views.dto";

/** The people you play with; each links to the pair's page. */
export async function FriendList({
  friends,
  now,
  error,
}: {
  friends: FriendCandidate[];
  now: Date;
  /** Set when OpenDota's teammate list couldn't be loaded. */
  error?: string | null;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="friends">
      <div className="p-5 pb-3">
        <p className="kicker">{t("together.friends.kicker")}</p>
        <h2 id="friends" className="text-lg font-semibold">
          {t("together.friends.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("together.friends.description")}</p>
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
            {t("together.friends.emptyBefore")}{" "}
            <Link href="/players" className="text-gold hover:underline">
              {t("together.friends.emptyLink")}
            </Link>{" "}
            {t("together.friends.emptyAfter")}
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
                        ? t("together.friends.onYourTeam", {
                            games: plural(t, "together.units.game", f.sameTeamGames),
                          })
                        : t("together.friends.tracked")}
                      {" · "}
                      {f.partyGames > 0 ? (
                        <span className="text-gold">
                          {plural(t, "together.units.confirmedPartyGame", f.partyGames)}
                        </span>
                      ) : (
                        t("together.friends.noParties")
                      )}
                    </span>
                  </div>
                  {f.lastPlayedAt && (
                    <time
                      dateTime={f.lastPlayedAt.toISOString()}
                      className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                      title={t("together.friends.lastPlayedTitle")}
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
