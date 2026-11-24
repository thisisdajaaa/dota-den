import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarHeart } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural, type Translator } from "@/common/i18n/translate";
import type { Messages } from "@/common/i18n/messages";
import { getViewerTimeZone } from "@/common/http/request-context";
import { EmptyState } from "@/components/empty-state";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { yearReviewService } from "@/modules/report";
import {
  MIN_HERO_GAMES,
  MIN_MONTH_GAMES,
  MIN_YEAR_GAMES,
  type WinRecord,
  type YearReview,
} from "@/modules/report/domain/year-review";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("report.year.title") };
}

type T = Translator<Messages>;
type Heroes = Map<number, HeroInfo>;

const YEAR = /^\d{4}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const wr = (r: WinRecord) => (r.games ? formatPercent(r.wins / r.games) : "–");

export default async function YearReviewPage({ searchParams }: PageProps<"/report/year">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const asked = one(params.year);
  const [{ timeZone }, heroes, t] = await Promise.all([
    getViewerTimeZone(),
    matchesService.heroMap(),
    getT(),
  ]);
  const view = await yearReviewService.review(
    user.accountId32,
    asked && YEAR.test(asked) ? Number(asked) : null,
    timeZone,
  );
  const { review: r, years, ongoing } = view;
  const date = (d: Date, withYear = false) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone,
    }).format(d);
  const top = r.topHeroes[0];
  const topHero = top ? heroes.get(top.heroId) : undefined;

  return (
    <div className="space-y-6">
      <section className="panel relative isolate overflow-hidden" aria-labelledby="year-heading">
        {topHero?.renderUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[60%] [mask-image:linear-gradient(to_left,black_35%,transparent)] sm:block"
          >
            <Image
              src={topHero.renderUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 640px, 60vw"
              className="scale-110 object-cover object-[center_8%] opacity-60"
              priority
            />
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 -z-10 size-72 rounded-full bg-gold/10 blur-3xl"
        />
        <div className="flex flex-col gap-4 p-5 sm:p-8">
          <p className="kicker">{t("report.year.kicker", { year: r.year })}</p>
          <h1
            id="year-heading"
            className="font-display text-4xl font-bold tracking-wide sm:text-6xl"
          >
            {t("report.year.heading", { year: r.year })}
          </h1>
          {r.games > 0 && (
            <p className="text-lg text-foreground/90 tabular-nums sm:text-xl">
              {plural(t, "report.year.summary", r.games, {
                hours: hoursText(t, r.playedSec),
                wins: r.wins.toLocaleString("en-US"),
              })}
            </p>
          )}
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("report.year.description", { year: r.year })}
          </p>
          {years.length > 1 && (
            <SegmentedLinks
              label={t("report.year.years")}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
              active={String(r.year)}
              href={(v) => `/report/year?year=${v}`}
            />
          )}
        </div>
      </section>

      {ongoing && r.games >= MIN_YEAR_GAMES && (
        <p className="text-sm text-muted-foreground">{t("report.year.soFar", { year: r.year })}</p>
      )}

      {r.games < MIN_YEAR_GAMES ? (
        <EmptyState
          icon={CalendarHeart}
          title={t("report.year.empty.title", { year: r.year })}
          description={t("report.year.empty.body")}
          action={{ href: "/report", label: t("report.year.empty.action") }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile
              label={t("report.year.tiles.games")}
              value={r.games.toLocaleString("en-US")}
              detail={t("report.year.tiles.ranked", {
                n: r.ranked.games.toLocaleString("en-US"),
              })}
            />
            <StatTile
              label={t("report.year.tiles.winRate")}
              value={wr(r)}
              meter={r.wins / r.games}
              tone={r.wins / r.games >= 0.5 ? "win" : "loss"}
              detail={t("report.year.tiles.wonOf", {
                wins: r.wins.toLocaleString("en-US"),
                games: r.games.toLocaleString("en-US"),
              })}
            />
            <StatTile label={t("report.year.tiles.played")} value={hoursText(t, r.playedSec)} />
            <StatTile label={t("report.year.tiles.heroes")} value={String(r.heroesPlayed)} />
            <StatTile
              label={t("report.year.tiles.winStreak")}
              value={r.longestWinStreak ? String(r.longestWinStreak.games) : "0"}
              tone="win"
              detail={
                r.longestWinStreak
                  ? t("report.year.tiles.streakDates", {
                      from: date(r.longestWinStreak.from),
                      to: date(r.longestWinStreak.to),
                    })
                  : t("report.year.tiles.none")
              }
            />
            <StatTile
              label={t("report.year.tiles.biggestDay")}
              value={r.biggestDay ? String(r.biggestDay.games) : "0"}
              detail={
                r.biggestDay
                  ? t("report.year.tiles.dayRecord", {
                      day: dayText(r.biggestDay.day),
                      wins: r.biggestDay.wins,
                      losses: r.biggestDay.games - r.biggestDay.wins,
                    })
                  : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <HeroesCard r={r} heroes={heroes} t={t} />
            <MonthsCard r={r} t={t} />
            <WhenCard r={r} t={t} />
            <HighlightsCard r={r} heroes={heroes} t={t} date={date} />
          </div>
        </>
      )}
    </div>
  );
}

function hoursText(t: T, seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  return hours >= 1
    ? plural(t, "report.year.hours", hours)
    : t("report.year.minutes", { n: Math.round(seconds / 60) });
}

const dayText = (k: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${k}T12:00:00Z`),
  );

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, i, 15)),
  ),
);
const LONG_MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, i, 15)),
  ),
);
// 2026-11-01 was a Sunday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 10, 1 + i)),
  ),
);
const hourText = (h: number) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 0, 1, h % 24)),
  );

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-4 p-5" aria-label={title}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function HeroesCard({ r, heroes, t }: { r: YearReview; heroes: Heroes; t: T }) {
  const best = r.bestHero;
  return (
    <Card title={t("report.year.heroes.title")}>
      <ol className="space-y-2">
        {r.topHeroes.map((h, i) => {
          const hero = heroes.get(h.heroId);
          return (
            <li key={h.heroId} className="flex items-center gap-3">
              <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <HeroPortrait hero={hero} heroId={h.heroId} size="md" />
              <div className="min-w-0">
                <p className="truncate font-medium">{heroName(hero, h.heroId)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("report.year.heroes.record", {
                    games: h.games,
                    wr: wr(h),
                    k: (h.kills / h.games).toFixed(1),
                    d: (h.deaths / h.games).toFixed(1),
                    a: (h.assists / h.games).toFixed(1),
                  })}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted-foreground">
        {best
          ? t("report.year.heroes.best", {
              min: MIN_HERO_GAMES,
              hero: heroName(heroes.get(best.heroId), best.heroId),
              wr: wr(best),
              games: best.games,
            })
          : t("report.year.heroes.noBest", { min: MIN_HERO_GAMES })}
      </p>
    </Card>
  );
}

/** Bars scaled to the busiest entry; each carries its numbers as text for screen readers. */
function Bars({
  label,
  rows,
  names,
  text,
  highlight,
}: {
  label: string;
  rows: WinRecord[];
  names: string[];
  text: (i: number) => string;
  highlight: number | null;
}) {
  const max = Math.max(1, ...rows.map((m) => m.games));
  return (
    <ul aria-label={label} className="flex h-36 items-end gap-1 sm:gap-1.5">
      {rows.map((m, i) => (
        <li key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="sr-only">{text(i)}</span>
          <span aria-hidden className="text-[0.6rem] text-muted-foreground tabular-nums">
            {m.games || ""}
          </span>
          <span
            aria-hidden
            className={cn(
              "w-full rounded-t-sm",
              i === highlight ? "bg-gold" : m.games ? "bg-gold/35" : "bg-white/[0.06]",
            )}
            style={{ height: `${Math.max(2, (m.games / max) * 100)}%` }}
          />
          <span aria-hidden className="text-[0.65rem] text-muted-foreground">
            {names[i]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MonthsCard({ r, t }: { r: YearReview; t: T }) {
  const busy = r.busiestMonth;
  const best = r.bestMonth;
  return (
    <Card title={t("report.year.months.title")}>
      <Bars
        label={t("report.year.months.label")}
        rows={r.months}
        names={MONTHS.map((m) => m.slice(0, 1))}
        highlight={busy}
        text={(i) =>
          t("report.year.months.bar", {
            month: LONG_MONTHS[i]!,
            games: r.months[i]!.games,
            wr: wr(r.months[i]!),
          })
        }
      />
      <div className="space-y-1 text-sm text-muted-foreground">
        {busy !== null && (
          <p>
            {t("report.year.months.busiest", {
              month: LONG_MONTHS[busy]!,
              games: r.months[busy]!.games,
            })}
          </p>
        )}
        <p>
          {best !== null
            ? t("report.year.months.best", {
                month: LONG_MONTHS[best]!,
                wr: wr(r.months[best]!),
                games: r.months[best]!.games,
              })
            : t("report.year.months.noBest", { min: MIN_MONTH_GAMES })}
        </p>
      </div>
    </Card>
  );
}

function WhenCard({ r, t }: { r: YearReview; t: T }) {
  const busiest = r.weekdays.reduce((b, d, i) => (d.games > r.weekdays[b]!.games ? i : b), 0);
  return (
    <Card title={t("report.year.when.title")}>
      <Bars
        label={t("report.year.when.weekdays")}
        rows={r.weekdays}
        names={WEEKDAYS}
        highlight={r.weekdays[busiest]!.games ? busiest : null}
        text={(i) =>
          t("report.year.when.bar", {
            day: WEEKDAYS[i]!,
            games: r.weekdays[i]!.games,
            wr: wr(r.weekdays[i]!),
          })
        }
      />
      {r.peakHours && (
        <p className="text-sm text-muted-foreground">
          {t("report.year.when.peak", {
            from: hourText(r.peakHours.from),
            to: hourText(r.peakHours.from + 3),
            games: r.peakHours.games,
          })}
        </p>
      )}
    </Card>
  );
}

function HighlightsCard({
  r,
  heroes,
  t,
  date,
}: {
  r: YearReview;
  heroes: Heroes;
  t: T;
  date: (d: Date, withYear?: boolean) => string;
}) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  if (r.bestGame) {
    const g = r.bestGame;
    rows.push({
      label: t("report.year.highlights.bestGame"),
      value: (
        <>
          {t("report.year.highlights.bestGameDetail", {
            k: g.kills,
            d: g.deaths,
            a: g.assists,
            hero: heroName(heroes.get(g.heroId), g.heroId),
            date: date(g.at),
          })}{" "}
          <Link href={`/matches/${g.matchId}`} className="text-gold hover:underline">
            {t("report.year.highlights.openMatch")}
          </Link>
        </>
      ),
    });
  }
  if (r.longestLossStreak && r.longestLossStreak.games > 1)
    rows.push({
      label: t("report.year.highlights.lossStreak"),
      value: t("report.year.highlights.lossStreakDetail", {
        n: r.longestLossStreak.games,
        from: date(r.longestLossStreak.from),
        to: date(r.longestLossStreak.to),
      }),
    });
  for (const q of ["solo", "party"] as const)
    if (r.queue[q].games > 0)
      rows.push({
        label: t(`report.year.highlights.${q}`),
        value: t("report.year.highlights.queueRecord", {
          games: r.queue[q].games,
          wr: wr(r.queue[q]),
        }),
      });
  if (r.first) rows.push({ label: t("report.year.highlights.first"), value: date(r.first, true) });

  return (
    <Card title={t("report.year.highlights.title")}>
      <dl className="divide-y divide-white/[0.06]">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd className="text-sm tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      {r.queue.unknown > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("report.year.highlights.unknown", { n: r.queue.unknown })}
        </p>
      )}
    </Card>
  );
}
