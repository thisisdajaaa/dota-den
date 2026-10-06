import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { DashboardFact, HeroInfo } from "../matches.ports";
import { formatAgo, formatDuration, partyName } from "./format";
import { HeroPortrait, heroName } from "./hero-portrait";

const COLS =
  "grid grid-cols-[1fr_auto] items-center gap-x-4 @3xl/rows:grid-cols-[minmax(0,1.6fr)_4.5rem_6.5rem_5.5rem_4rem_4.5rem_1rem]";

/** Queue name for a row (same rules as `queueLabel`, in the viewer's language). */
function queueText(
  t: Translator<Messages>,
  queueClass: "solo" | "party" | "unknown",
  partySize: number | null,
): string {
  if (queueClass === "solo") return t("matches.queue.solo");
  if (queueClass === "party") return partySize ? partyName(partySize) : t("matches.queue.party");
  return t("matches.queue.unknown");
}

export async function RecentMatchesCard({
  matches,
  heroes,
  now,
}: {
  matches: DashboardFact[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="recent-matches">
      <div className="flex items-baseline justify-between p-5 pb-3">
        <div>
          <p className="kicker">{t("matches.recent.kicker")}</p>
          <h2 id="recent-matches" className="text-lg font-semibold">
            {t("matches.recent.title")}
          </h2>
        </div>
        <Link href="/matches" className="text-xs text-gold hover:underline">
          {t("matches.recent.viewAll")}
        </Link>
      </div>
      <MatchRows matches={matches} heroes={heroes} now={now} />
    </section>
  );
}

/** Column header + clickable rows; shared by the dashboard and the match list. */
export async function MatchRows({
  matches,
  heroes,
  now,
}: {
  matches: DashboardFact[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  // Sized by its own width, not the viewport: it's also used in narrow columns.
  return (
    <div className="@container/rows">
      <div
        aria-hidden
        className={cn(
          COLS,
          "hidden border-y border-white/[0.06] px-5 py-2 text-[0.65rem] tracking-wider text-muted-foreground uppercase @3xl/rows:grid",
        )}
      >
        <span>{t("matches.rows.hero")}</span>
        <span>{t("matches.rows.result")}</span>
        <span>{t("matches.rows.kda")}</span>
        <span>{t("matches.rows.queue")}</span>
        <span>{t("matches.rows.length")}</span>
        <span>{t("matches.rows.played")}</span>
        <span />
      </div>

      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06] @3xl/rows:border-t-0">
        {matches.map((m) => {
          const hero = heroes.get(m.heroId);
          const win = m.result === "win";
          const name = heroName(hero, m.heroId);
          const result = win ? t("matches.result.win") : t("matches.result.loss");
          const queue = queueText(t, m.queueClass, m.partySize);
          return (
            <li key={m.matchId}>
              <Link
                href={`/matches/${m.matchId}`}
                aria-label={t("matches.rows.rowLabel", {
                  result,
                  hero: name,
                  kda: `${m.kills}/${m.deaths}/${m.assists}`,
                  ago: formatAgo(m.startedAt, now),
                })}
                className={cn(
                  COLS,
                  "group relative px-5 py-2.5 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-2 left-0 w-0.5 rounded-r",
                    win ? "bg-win" : "bg-loss",
                  )}
                />
                <span className="flex min-w-0 items-center gap-3">
                  <HeroPortrait hero={hero} heroId={m.heroId} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground">
                      {m.ranked ? t("matches.rows.ranked") : t("matches.rows.unranked")}
                      {m.patch && ` · ${m.patch}${m.patchCertainty === "boundary" ? "?" : ""}`}
                      <span className="@3xl/rows:hidden">
                        {" · "}
                        {queue} · {formatAgo(m.startedAt, now)}
                      </span>
                    </span>
                  </span>
                </span>

                {/* Mobile: result + KDA stacked on the right. */}
                <span className="text-right @3xl/rows:hidden">
                  <span
                    className={cn("block text-xs font-semibold", win ? "text-win" : "text-loss")}
                  >
                    {result}
                  </span>
                  <span className="block text-xs tabular-nums">
                    {m.kills}/{m.deaths}/{m.assists}
                  </span>
                </span>

                <span className="hidden @3xl/rows:block">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-xs font-semibold",
                      win ? "bg-win/15 text-win" : "bg-loss/15 text-loss",
                    )}
                  >
                    {result}
                  </span>
                </span>
                <span className="hidden text-sm tabular-nums @3xl/rows:block">
                  {m.kills}
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-loss">{m.deaths}</span>
                  <span className="text-muted-foreground"> / </span>
                  {m.assists}
                </span>
                <span
                  className={cn(
                    "hidden text-xs @3xl/rows:block",
                    m.queueClass === "unknown" && "text-muted-foreground italic",
                  )}
                >
                  {queue}
                </span>
                <span className="hidden text-sm text-muted-foreground tabular-nums @3xl/rows:block">
                  {formatDuration(m.durationSec)}
                </span>
                <span className="hidden text-sm text-muted-foreground @3xl/rows:block">
                  <time dateTime={m.startedAt.toISOString()}>{formatAgo(m.startedAt, now)}</time>
                </span>
                <ChevronRight
                  aria-hidden
                  className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold @3xl/rows:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
