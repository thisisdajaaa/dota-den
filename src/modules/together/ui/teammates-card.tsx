"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { TeammateView } from "../dtos/responses/together-views.dto";
import { MIN_TEAMMATE_GAMES, sortTeammates, type TeammateSort } from "../domain/teammates";
import { formatDelta } from "./copy";

/** Serializable teammate row (Dates cross the server/client boundary as ISO strings). */
export type TeammateRow = Omit<TeammateView, "lastPlayedAt"> & { lastPlayedAt: string | null };

const SORTS: ReadonlyArray<{ value: TeammateSort; label: string }> = [
  { value: "games", label: "Most games" },
  { value: "winrate", label: "Win rate" },
  { value: "recent", label: "Recent" },
];

const COLLAPSED = 6;

export function TeammatesCard({ rows, now }: { rows: TeammateRow[]; now: string }) {
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
          <p className="kicker">Teammates</p>
          <h2 id="teammates" className="text-lg font-semibold">
            Who you play with
          </h2>
          <p className="text-xs text-muted-foreground">
            Games on the same team in your public matches, whether you queued together or not.
          </p>
        </div>
        <Link href="/together" className="text-xs text-gold hover:underline">
          Play together
        </Link>
      </div>

      <div
        role="radiogroup"
        aria-label="Sort teammates by"
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
            {o.label}
          </button>
        ))}
      </div>

      {hidden > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Showing teammates with {MIN_TEAMMATE_GAMES}+ games; {hidden} with fewer are left out so a
          lucky game or two doesn&apos;t top the list.
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No teammate has {MIN_TEAMMATE_GAMES}+ games with you yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((t) => {
            const name = displayName(t.personaName, t.accountId32);
            const rank = parseRankTier(t.rankTier, t.leaderboardRank);
            return (
              <li
                key={t.accountId32}
                className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[auto_1fr_auto]"
              >
                <PlayerAvatar url={t.avatarUrl} name={name} size="sm" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/together/${t.accountId32}`}
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
                    {plural(t.withGames, "game")} on your team ·{" "}
                    <span className="text-win">{plural(t.withWins, "win")}</span> ·{" "}
                    {formatPercent(t.winRate)}
                    {t.confirmedParties > 0 && (
                      <span className="text-gold">
                        {" "}
                        · {plural(t.confirmedParties, "confirmed party game")}
                      </span>
                    )}
                  </p>
                  <WinRateBar rate={t.winRate} muted={t.lowSample} className="h-1.5 max-w-xs" />
                  <p className="text-xs text-muted-foreground">
                    {t.againstGames > 0
                      ? `Against: ${plural(t.againstGames, "game")} · ${plural(t.againstWins, "win")}`
                      : "Never on the other team"}
                    {t.lastPlayedAt &&
                      ` · last played ${formatAgo(new Date(t.lastPlayedAt), nowDate)}`}
                    {" · "}
                    <Link
                      href={`/players/${t.accountId32}`}
                      className="hover:text-foreground hover:underline"
                    >
                      Profile
                    </Link>
                  </p>
                </div>
                <div className="col-start-2 text-xs sm:col-start-auto sm:w-32 sm:text-right">
                  {t.delta !== null ? (
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        t.delta >= 0 ? "text-win" : "text-loss",
                      )}
                    >
                      {formatDelta(t.delta)} vs your usual
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t.lowSample ? "Too few games to compare" : "No usual to compare with"}
                    </span>
                  )}
                  {t.usualRate !== null && (
                    <span className="block text-[0.7rem] text-muted-foreground">
                      Usual {formatPercent(t.usualRate)}
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
          {expanded ? "Show fewer" : `Show all ${sorted.length} teammates`}
        </button>
      )}
    </section>
  );
}
