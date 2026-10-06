"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import type { HeroInfo } from "../matches.ports";
import {
  HERO_SORT_MIN_GAMES,
  sortHeroes,
  type HeroSort,
  type HeroSummary,
} from "../domain/match-summary";
import { formatAgo, formatPercent } from "./format";
import { HeroPortrait, heroName } from "./hero-portrait";
import { WinRateBar } from "./win-rate-bar";

/** Serializable hero row (Dates cross the server/client boundary as ISO strings). */
export type HeroPoolRow = Omit<HeroSummary, "lastPlayed"> & { lastPlayed: string };

const SORTS: readonly HeroSort[] = ["games", "winrate", "kda", "recent"];

const COLLAPSED = 8;

export function HeroPoolCard({
  rows,
  heroes,
  now,
}: {
  rows: HeroPoolRow[];
  heroes: HeroInfo[];
  /** Server time (ISO) so "played 3d ago" matches the rest of the page. */
  now: string;
}) {
  const t = useT();
  const [sort, setSort] = useState<HeroSort>("games");
  const [expanded, setExpanded] = useState(false);
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const sorted = useMemo(
    () =>
      sortHeroes(
        rows.map((r) => ({ ...r, lastPlayed: new Date(r.lastPlayed) })),
        sort,
      ),
    [rows, sort],
  );
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED);
  const hidden = rows.length - sorted.length;
  const nowDate = new Date(now);

  return (
    <section className="panel p-5" aria-labelledby="hero-pool">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="kicker">{t("matches.heroPool.kicker")}</p>
          <h2 id="hero-pool" className="text-lg font-semibold">
            {t("matches.heroPool.title")}
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("matches.heroPool.played", { n: rows.length })}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label={t("matches.heroPool.sortLabel")}
        className="mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-white/[0.07] bg-background/40 p-0.5"
      >
        {SORTS.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={sort === o}
            onClick={() => setSort(o)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              sort === o ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`matches.heroPool.sorts.${o}`)}
          </button>
        ))}
      </div>

      {hidden > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {t("matches.heroPool.hiddenNote", { min: HERO_SORT_MIN_GAMES, hidden })}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("matches.heroPool.empty", { min: HERO_SORT_MIN_GAMES })}
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((h, i) => {
            const hero = heroMap.get(h.heroId);
            return (
              <li key={h.heroId}>
                <Link
                  href={`/heroes/${h.heroId}`}
                  className="grid grid-cols-[1.25rem_auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                >
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <HeroPortrait hero={hero} heroId={h.heroId} size="md" />
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium">{heroName(hero, h.heroId)}</span>
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {sort === "recent"
                          ? formatAgo(h.lastPlayed, nowDate)
                          : t("matches.heroPool.games", { n: h.games })}
                      </span>
                    </div>
                    <WinRateBar rate={h.winRate} muted={h.lowSample} className="h-1.5" />
                  </div>
                  <div className="w-16 text-right">
                    <div
                      className={cn(
                        "text-sm tabular-nums",
                        sort === "kda" ? "text-muted-foreground" : "font-semibold",
                      )}
                    >
                      {formatPercent(h.winRate)}
                    </div>
                    <div
                      className={cn(
                        "text-[0.7rem] tabular-nums",
                        sort === "kda" ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t("matches.heroPool.kda", { value: h.kda.toFixed(2) })}
                    </div>
                  </div>
                </Link>
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
            ? t("matches.heroPool.showFewer")
            : t("matches.heroPool.showAll", { n: sorted.length })}
        </button>
      )}
    </section>
  );
}
