"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { useT } from "@/common/i18n/client";
import { plural } from "@/common/i18n/translate";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { TeammateView } from "../dtos/responses/together-views.dto";
import { MIN_TEAMMATE_GAMES, sortTeammates, type TeammateSort } from "../domain/teammates";
import { formatDelta } from "./copy";

/** Serializable teammate row (Dates cross the server/client boundary as ISO strings). */
export type TeammateRow = Omit<TeammateView, "lastPlayedAt"> & { lastPlayedAt: string | null };

const SORTS = [
  { value: "games", label: "sortGames" },
  { value: "winrate", label: "sortWinRate" },
  { value: "recent", label: "sortRecent" },
] as const satisfies ReadonlyArray<{ value: TeammateSort; label: string }>;

const COLLAPSED = 6;

export function TeammatesCard({ rows, now }: { rows: TeammateRow[]; now: string }) {
  const t = useT();
  const [sort, setSort] = useState<TeammateSort>("games");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () =>
      sortTeammates(
        rows.map((r) => ({ ...r, lastPlayedAt: r.lastPlayedAt ? new Date(r.lastPlayedAt) : null })),
        sort,
      ),
    [rows, sort],
  );
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED);
  const hidden = rows.length - sorted.length;
  const nowDate = new Date(now);

  return (
    <section className="panel p-5" aria-labelledby="teammates">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="kicker">{t("together.teammates.kicker")}</p>
          <h2 id="teammates" className="text-lg font-semibold">
            {t("together.teammates.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("together.teammates.description")}</p>
        </div>
        <Link href="/together" className="text-xs text-gold hover:underline">
          {t("together.teammates.playTogether")}
        </Link>
      </div>

      <div
        role="radiogroup"
        aria-label={t("together.teammates.sortLabel")}
        className="mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-white/[0.07] bg-background/40 p-0.5"
      >
        {SORTS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={sort === o.value}
            onClick={() => setSort(o.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              sort === o.value
                ? "bg-gold/15 text-gold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`together.teammates.${o.label}`)}
          </button>
        ))}
      </div>

      {hidden > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("together.teammates.hiddenNote", { min: MIN_TEAMMATE_GAMES, hidden })}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("together.teammates.empty", { min: MIN_TEAMMATE_GAMES })}
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((row) => {
            const name = displayName(row.personaName, row.accountId32);
            const rank = parseRankTier(row.rankTier, row.leaderboardRank);
            return (
              <li
                key={row.accountId32}
                className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[auto_1fr_auto]"
              >
                <PlayerAvatar url={row.avatarUrl} name={name} size="sm" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/together/${row.accountId32}`}
                      className="truncate font-medium hover:text-gold focus-visible:text-gold focus-visible:outline-none"
                    >
                      {name}
                    </Link>
                    {rank && (
                      <span className="flex shrink-0 items-center gap-1 text-[0.7rem] text-muted-foreground">
                        <RankMedal rank={rank} size={20} />
                        <span className="hidden sm:inline">{rankLabel(rank)}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("together.friends.onYourTeam", {
                      games: plural(t, "together.units.game", row.withGames),
                    })}{" "}
                    ·{" "}
                    <span className="text-win">
                      {plural(t, "together.units.win", row.withWins)}
                    </span>{" "}
                    · {formatPercent(row.winRate)}
                    {row.confirmedParties > 0 && (
                      <span className="text-gold">
                        {" "}
                        · {plural(t, "together.units.confirmedPartyGame", row.confirmedParties)}
                      </span>
                    )}
                  </p>
                  <WinRateBar rate={row.winRate} muted={row.lowSample} className="h-1.5 max-w-xs" />
                  <p className="text-xs text-muted-foreground">
                    {row.againstGames > 0
                      ? t("together.teammates.against", {
                          games: plural(t, "together.units.game", row.againstGames),
                          wins: plural(t, "together.units.win", row.againstWins),
                        })
                      : t("together.teammates.neverAgainst")}
                    {row.lastPlayedAt &&
                      ` · ${t("together.teammates.lastPlayed", { ago: formatAgo(new Date(row.lastPlayedAt), nowDate) })}`}
                    {" · "}
                    <Link
                      href={`/players/${row.accountId32}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {t("together.teammates.profile")}
                    </Link>
                  </p>
                </div>
                <div className="col-start-2 text-xs sm:col-start-auto sm:w-32 sm:text-right">
                  {row.delta !== null ? (
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        row.delta >= 0 ? "text-win" : "text-loss",
                      )}
                    >
                      {t("together.comparison.vsUsual", { delta: formatDelta(row.delta) })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {row.lowSample
                        ? t("together.teammates.tooFew")
                        : t("together.teammates.noUsual")}
                    </span>
                  )}
                  {row.usualRate !== null && (
                    <span className="block text-[0.7rem] text-muted-foreground">
                      {t("together.teammates.usual", { rate: formatPercent(row.usualRate) })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {sorted.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-3 w-full rounded-lg border border-white/[0.07] py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/30 hover:text-foreground"
        >
          {expanded
            ? t("together.teammates.showFewer")
            : t("together.teammates.showAll", { n: sorted.length })}
        </button>
      )}
    </section>
  );
}
