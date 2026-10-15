import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";

export interface StretchCardData {
  from: Date;
  to: Date;
  /** "Legend 2 → Ancient 1", or "3,500 → 4,100". */
  change: string;
  /** "+4 stars", or "+600 MMR". */
  amount: string;
  games: number;
  wins: number;
  losses: number;
  heroes: ReadonlyArray<{ heroId: number; games: number; wins: number }>;
}

/** A dated stretch of the rank journey, with the ranked games and heroes played in it. */
export async function JourneyStretchCard({
  title,
  tone,
  stretch,
  emptyText,
  heroes,
  timeZone,
}: {
  title: string;
  tone: "win" | "loss";
  stretch: StretchCardData | null;
  emptyText: string;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const t = await getT();
  const Icon = tone === "win" ? TrendingUp : TrendingDown;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <article className="panel space-y-3 p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">{title}</p>
          {stretch ? (
            <>
              <p className="mt-1 font-semibold">{stretch.change}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {day.formatRange(stretch.from, stretch.to)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
        {stretch && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums",
              tone === "win" ? "text-win" : "text-loss",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {stretch.amount}
          </span>
        )}
      </div>
      {stretch &&
        (stretch.games === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mmr.journey.noGames")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {plural(t, "mmr.journey.rankedGames", stretch.games)} ·{" "}
              {t("mmr.journey.record", { wins: stretch.wins, losses: stretch.losses })}
            </p>
            <ul aria-label={t("mmr.journey.mostPlayed")} className="space-y-1.5">
              {stretch.heroes.map((h) => {
                const name = heroName(heroes.get(h.heroId), h.heroId);
                const losses = h.games - h.wins;
                return (
                  <li
                    key={h.heroId}
                    className="flex items-center gap-2 text-sm"
                    aria-label={t("mmr.journey.heroRecord", { name, wins: h.wins, losses })}
                  >
                    <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("mmr.journey.record", { wins: h.wins, losses })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </article>
  );
}
