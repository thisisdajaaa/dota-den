import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { HeroInfo, RankedResultRow } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { queueLabel } from "@/modules/matches/ui/format";
import { ESTIMATE_PER_GAME, type CalendarDay } from "../domain/calendar";
import { basisOf, deltaLabel } from "./day-tone";

export async function DayDetail({
  dayKey,
  day,
  matches,
  heroes,
  timeZone,
  closeHref,
}: {
  dayKey: string;
  day: CalendarDay | undefined;
  matches: RankedResultRow[];
  heroes: Map<number, HeroInfo>;
  timeZone: string;
  closeHref: string;
}) {
  const t = await getT();
  const basis = basisOf(day);
  const label = deltaLabel(day);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dayKey}T12:00:00Z`));

  return (
    <section className="panel p-5" aria-labelledby="day-detail">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker">{t("mmr.day.kicker")}</p>
          <h2 id="day-detail" className="text-lg font-semibold">
            {date}
          </h2>
        </div>
        <Link
          href={closeHref}
          scroll={false}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("mmr.day.close")}
        >
          <X className="size-4" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-xs text-muted-foreground">{t("mmr.day.change")}</div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              label?.startsWith("+") || label?.startsWith("≈ +")
                ? "text-win"
                : label?.includes("−")
                  ? "text-loss"
                  : "",
            )}
          >
            {label ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {basis === "actual"
              ? t("mmr.day.exact")
              : basis === "estimate"
                ? t("mmr.day.estimate", { n: ESTIMATE_PER_GAME })
                : t("mmr.day.none")}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-xs text-muted-foreground">{t("mmr.day.rankedGames")}</div>
          <div className="text-2xl font-semibold">{day?.games ?? 0}</div>
          <div className="text-xs text-muted-foreground">
            {day?.games
              ? t("mmr.calendar.record", { wins: day.wins, losses: day.losses })
              : t("mmr.day.nothing")}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="text-xs text-muted-foreground">{t("mmr.day.logged")}</div>
          {day?.observations.length ? (
            <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
              {day.observations.map((o, i) => (
                <li key={i}>
                  <span className="font-semibold">{o.mmr.toLocaleString("en-US")}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {t("mmr.day.at", { time: time.format(o.observedAt) })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">{t("mmr.day.noEntries")}</div>
          )}
        </div>
      </div>

      {matches.length > 0 && (
        <ul className="mt-4 divide-y divide-white/[0.05] overflow-hidden rounded-lg border border-white/[0.06]">
          {matches.map((m) => {
            const hero = heroes.get(m.heroId);
            const win = m.result === "win";
            return (
              <li key={m.matchId}>
                <Link
                  href={`/matches/${m.matchId}`}
                  className="group flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]"
                >
                  <HeroPortrait hero={hero} heroId={m.heroId} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {heroName(hero, m.heroId)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {queueLabel(m.queueClass, null)}
                  </span>
                  <span className="w-14 text-xs text-muted-foreground tabular-nums">
                    {time.format(m.startedAt)}
                  </span>
                  <span className={cn("w-9 text-xs font-semibold", win ? "text-win" : "text-loss")}>
                    {win ? t("mmr.day.win") : t("mmr.day.loss")}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 text-muted-foreground group-hover:text-gold"
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
