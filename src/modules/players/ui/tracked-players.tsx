import Link from "next/link";
import { UserPlus } from "lucide-react";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { getT } from "@/common/i18n/server";
import { formatAgo } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import type { TrackedPlayersPage } from "../dtos/responses/follows.dto";
import { displayName, PlayerAvatar } from "./player-avatar";
import { TrackButton } from "./track-button";

export async function TrackedPlayers({
  data,
  limit,
  now,
  pageHref,
}: {
  data: TrackedPlayersPage;
  limit: number;
  now: Date;
  pageHref: (page: number) => string;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="tracked-players">
      <div className="flex items-baseline justify-between gap-3 p-5 pb-3">
        <div>
          <p className="kicker">{t("players.tracked.kicker")}</p>
          <h2 id="tracked-players" className="text-lg font-semibold">
            {t("players.tracked.title")}
          </h2>
        </div>
        {data.total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("players.tracked.count", { total: data.total, limit })}
          </span>
        )}
      </div>

      {data.total === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <UserPlus aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
          <p>
            {t("players.tracked.emptyBefore")}{" "}
            <span className="font-semibold text-foreground">{t("players.track.track")}</span>
            {t("players.tracked.emptyAfter")}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
            {data.items.map((p) => {
              const name = displayName(p.personaName, p.accountId32);
              const rank = parseRankTier(p.rankTier, p.leaderboardRank);
              return (
                <li key={p.accountId32} className="flex items-center gap-3 px-5 py-3">
                  <Link
                    href={`/players/${p.accountId32}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:outline-none"
                  >
                    <PlayerAvatar url={p.avatarUrl} name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium hover:text-gold">{name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.lastMatchAt ? (
                          <time dateTime={p.lastMatchAt.toISOString()}>
                            {t("players.tracked.lastMatch", { ago: formatAgo(p.lastMatchAt, now) })}
                          </time>
                        ) : (
                          t("players.tracked.noRecent")
                        )}
                        {rank && <span className="sm:hidden"> · {rankLabel(rank)}</span>}
                      </span>
                    </span>
                  </Link>
                  {rank && (
                    <span className="hidden items-center gap-1.5 sm:flex">
                      <RankMedal rank={rank} size={36} />
                      <span className="w-24 truncate text-xs font-semibold text-gold">
                        {rankLabel(rank)}
                      </span>
                    </span>
                  )}
                  <TrackButton accountId32={p.accountId32} name={name} tracked compact />
                </li>
              );
            })}
          </ul>
          {data.pageCount > 1 && (
            <nav
              aria-label={t("players.tracked.pagesLabel")}
              className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-xs"
            >
              {data.page > 1 ? (
                <Link href={pageHref(data.page - 1)} className="text-gold hover:underline">
                  {t("players.tracked.newer")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">
                {t("players.tracked.pageOf", { page: data.page, count: data.pageCount })}
              </span>
              {data.page < data.pageCount ? (
                <Link href={pageHref(data.page + 1)} className="text-gold hover:underline">
                  {t("players.tracked.older")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
