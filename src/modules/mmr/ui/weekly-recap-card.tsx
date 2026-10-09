import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { HeroWeek, WeeklyRecap } from "../domain/weekly-recap";

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;

function Hero({ label, h, heroes }: { label: string; h: HeroWeek; heroes: Map<number, HeroInfo> }) {
  const hero = heroes.get(h.heroId);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">
          {heroName(hero, h.heroId)}{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            {h.wins}–{h.games - h.wins}
          </span>
        </p>
      </div>
    </div>
  );
}

/** This week's ranked games against last week's, with the MMR change. */
export async function WeeklyRecapCard({
  recap,
  heroes,
  rangeLabel,
  action,
}: {
  recap: WeeklyRecap;
  heroes: Map<number, HeroInfo>;
  rangeLabel: string;
  /** Extra control in the header (e.g. Share). */
  action?: React.ReactNode;
}) {
  const t = await getT();
  const { thisWeek: w, lastWeek: l, mmr } = recap;
  const delta = w.winRate !== null && l.winRate !== null ? w.winRate - l.winRate : null;
  const mmrValue = mmr.exact ?? (w.games > 0 ? mmr.estimate : null);
  return (
    <section className="panel p-5" aria-labelledby="week-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="kicker">{rangeLabel}</p>
          <h2 id="week-title" className="text-lg font-semibold">
            {t("mmr.recap.title")}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {action}
          <Link
            href="/mmr?view=week"
            className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
          >
            {t("mmr.recap.link")} <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      {w.games === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("mmr.recap.none")}
          {l.games > 0 &&
            ` ${t("mmr.recap.lastWeek", { wins: l.wins, losses: l.losses, rate: formatPercent(l.winRate) })}`}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("mmr.recap.ranked")}</p>
            <p className="text-xl font-semibold tabular-nums">
              <span className="text-win">{w.wins}W</span>–
              <span className="text-loss">{w.losses}L</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("mmr.recap.winRate")}</p>
            <p className="text-xl font-semibold tabular-nums">{formatPercent(w.winRate)}</p>
            <p className="text-xs text-muted-foreground">
              {l.games === 0
                ? t("mmr.recap.noLastWeek")
                : delta === 0
                  ? t("mmr.recap.same")
                  : t(delta !== null && delta > 0 ? "mmr.recap.up" : "mmr.recap.down", {
                      rate: formatPercent(l.winRate),
                    })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("mmr.recap.mmr")}</p>
            <p
              className={cn(
                "text-xl font-semibold tabular-nums",
                mmrValue !== null && mmrValue > 0 && "text-win",
                mmrValue !== null && mmrValue < 0 && "text-loss",
              )}
            >
              {mmrValue === null ? "—" : `${mmr.exact === null ? "≈ " : ""}${signed(mmrValue)}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {mmr.exact !== null ? t("mmr.recap.exact") : t("mmr.recap.estimate")}
            </p>
          </div>
          <div className="col-span-2 space-y-2 sm:col-span-1">
            {recap.mostPlayed && (
              <Hero label={t("mmr.recap.mostPlayed")} h={recap.mostPlayed} heroes={heroes} />
            )}
            {recap.best && recap.best.heroId !== recap.mostPlayed?.heroId && (
              <Hero label={t("mmr.recap.best")} h={recap.best} heroes={heroes} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
