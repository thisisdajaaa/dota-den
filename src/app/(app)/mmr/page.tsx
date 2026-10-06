import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { toMmrEntryDto } from "@/modules/mmr/dtos/responses/mmr-entry.dto";
import { getViewerTimeZone } from "@/common/http/request-context";
import { mmrInsightsService, screenshotService } from "@/modules/mmr";
import { dayValue, ESTIMATE_PER_GAME, type QueueScope } from "@/modules/mmr/domain/calendar";
import { dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { isDayKey, type CalendarView } from "@/modules/mmr/domain/periods";
import { CalendarLegend } from "@/modules/mmr/ui/calendar-legend";
import { DayDetail } from "@/modules/mmr/ui/day-detail";
import { DeleteEntryButton } from "@/modules/mmr/ui/delete-entry-button";
import { HeroClimbSection } from "@/modules/mmr/ui/hero-climb-section";
import { MedalHistorySection } from "@/modules/mmr/ui/medal-history-section";
import { MmrEntryDialog } from "@/modules/mmr/ui/mmr-entry-dialog";
import { MmrTrendChart } from "@/modules/mmr/ui/mmr-trend-chart";
import { MonthGrid } from "@/modules/mmr/ui/month-grid";
import { WeekView } from "@/modules/mmr/ui/week-view";
import { YearHeatmap } from "@/modules/mmr/ui/year-heatmap";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("mmr.page.title") };
}

const VIEWS: readonly CalendarView[] = ["week", "month", "year", "all"];
const SCOPES: readonly QueueScope[] = ["all", "solo", "party"];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0";
}

export default async function MmrPage({ searchParams }: PageProps<"/mmr">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const params = await searchParams;
  const { timeZone } = await getViewerTimeZone();
  const dayKey = dayKeyFormatter(timeZone);
  const now = new Date();
  const today = dayKey(now);

  const viewParam = one(params.view);
  const view: CalendarView = VIEWS.some((v) => v === viewParam)
    ? (viewParam as CalendarView)
    : "month";
  const scopeParam = one(params.scope);
  const scope: QueueScope = SCOPES.some((s) => s === scopeParam)
    ? (scopeParam as QueueScope)
    : "all";
  const anchorParam = one(params.date);
  const anchor = isDayKey(anchorParam) ? anchorParam : today;
  const selectedParam = one(params.day);
  const selected = isDayKey(selectedParam) ? selectedParam : null;

  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [{ entries, medals, period, calendar, climbs, matches }, heroes] = await Promise.all([
    mmrInsightsService.calendarView(owner, { view, anchor, scope, timeZone, now }),
    matchesService.heroMap(),
  ]);
  const s = calendar.summary;

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { view, scope, date: anchor, day: selected, ...patch };
    if (merged.view && merged.view !== "month") q.set("view", merged.view);
    if (merged.scope && merged.scope !== "all") q.set("scope", merged.scope);
    if (merged.date && merged.date !== today) q.set("date", merged.date);
    if (merged.day) q.set("day", merged.day);
    const qs = q.toString();
    return qs ? `/mmr?${qs}` : "/mmr";
  };
  const hrefForDay = (key: DayKey) =>
    view === "year" || view === "all"
      ? href({ view: "month", date: key, day: key })
      : href({ day: key === selected ? null : key });

  const periodLabel =
    view === "week"
      ? `${fmt(period.from, { month: "short", day: "numeric" })} – ${fmt(period.to, { month: "short", day: "numeric", year: "numeric" })}`
      : view === "month"
        ? fmt(period.from, { month: "long", year: "numeric" })
        : view === "year"
          ? period.from.slice(0, 4)
          : t("mmr.page.since", { date: fmt(period.from, { month: "long", year: "numeric" }) });

  const selectedDay = selected ? calendar.days.get(selected) : undefined;
  const selectedMatches = selected
    ? matches
        .filter(
          (m) => dayKey(m.startedAt) === selected && (scope === "all" || m.queueClass === scope),
        )
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    : [];
  const current = entries.at(-1);
  const periodChange =
    s.actualNet !== null ? signed(s.actualNet) : s.games > 0 ? `≈ ${signed(s.estimatedNet)}` : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("mmr.page.kicker")}
        title={t("mmr.page.title")}
        description={t("mmr.page.description")}
        actions={<MmrEntryDialog canReadScreenshots={screenshotService.available} />}
      />

      <section aria-label={t("mmr.page.summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t("mmr.page.currentMmr")}
          value={current ? current.mmr.toLocaleString("en-US") : "—"}
          detail={
            current
              ? t("mmr.page.loggedAgo", { ago: formatAgo(current.observedAt, now) })
              : t("mmr.page.logToStart")
          }
          tone="gold"
        />
        <StatTile
          label={t("mmr.page.change", { period: periodLabel })}
          value={periodChange}
          detail={
            s.actualNet !== null
              ? t("mmr.page.exactFromEntries")
              : s.games > 0
                ? t("mmr.page.estimatePerRanked", { n: ESTIMATE_PER_GAME })
                : t("mmr.page.noRanked")
          }
        />
        <StatTile
          label={t("mmr.page.rankedRecord")}
          value={s.games ? `${s.wins}–${s.losses}` : "—"}
          detail={
            s.games
              ? t("mmr.page.winRate", { rate: formatPercent(s.winRate) })
              : t("mmr.page.noRanked")
          }
          meter={s.winRate}
          tone={s.winRate !== null && s.winRate >= 0.5 ? "win" : "loss"}
        />
        <StatTile
          label={t("mmr.page.bestWorst")}
          value={
            s.best || s.worst
              ? `${s.best ? signed(dayValue(s.best)) : "—"} / ${s.worst ? signed(dayValue(s.worst)) : "—"}`
              : "—"
          }
          detail={
            s.best || s.worst
              ? [
                  [
                    s.best && fmt(s.best.key, { month: "short", day: "numeric" }),
                    s.worst && fmt(s.worst.key, { month: "short", day: "numeric" }),
                  ]
                    .filter(Boolean)
                    .join(" / "),
                  [s.best, s.worst].some((d) => d && d.actualDelta === null)
                    ? t("mmr.page.estimated")
                    : t("mmr.page.exact"),
                ].join(" · ")
              : t("mmr.page.playSome")
          }
        />
      </section>

      <section className="panel space-y-5 p-5" aria-labelledby="calendar-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {period.prev ? (
              <Link
                href={href({ date: period.prev, day: null })}
                scroll={false}
                aria-label={t("mmr.page.prevPeriod")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : null}
            <h2 id="calendar-title" className="min-w-40 text-lg font-semibold">
              {periodLabel}
            </h2>
            {period.next && period.next <= today ? (
              <Link
                href={href({ date: period.next, day: null })}
                scroll={false}
                aria-label={t("mmr.page.nextPeriod")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : null}
            {anchor !== today && (
              <Link
                href={href({ date: today, day: null })}
                scroll={false}
                className="ml-1 text-xs text-gold hover:underline"
              >
                {t("mmr.page.today")}
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <SegmentedLinks
              label={t("mmr.page.calendarView")}
              options={VIEWS.map((value) => ({ value, label: t(`mmr.views.${value}`) }))}
              active={view}
              href={(v) => href({ view: v, day: null })}
            />
            <SegmentedLinks
              label={t("mmr.page.queue")}
              options={SCOPES.map((value) => ({ value, label: t(`mmr.scopes.${value}`) }))}
              active={scope}
              href={(v) => href({ scope: v })}
            />
          </div>
        </div>

        {view === "month" && (
          <MonthGrid
            from={period.from}
            to={period.to}
            calendar={calendar}
            today={today}
            selected={selected}
            hrefForDay={hrefForDay}
          />
        )}
        {view === "week" && (
          <WeekView
            from={period.from}
            to={period.to}
            calendar={calendar}
            today={today}
            selected={selected}
            hrefForDay={hrefForDay}
          />
        )}
        {view === "year" && (
          <YearHeatmap
            from={period.from}
            to={period.to}
            calendar={calendar}
            today={today}
            hrefForDay={hrefForDay}
          />
        )}
        {view === "all" && (
          <div className="space-y-6">
            {years(period.from, period.to)
              .reverse()
              .map((y) => (
                <YearHeatmap
                  key={y}
                  title={String(y)}
                  from={`${y}-01-01` < period.from ? period.from : `${y}-01-01`}
                  to={`${y}-12-31` > period.to ? period.to : `${y}-12-31`}
                  calendar={calendar}
                  today={today}
                  hrefForDay={hrefForDay}
                />
              ))}
          </div>
        )}

        <CalendarLegend />
        {scope !== "all" && (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info aria-hidden className="mt-px size-3.5 shrink-0" />
            {t("mmr.page.scopeNote", { scope })}
          </p>
        )}
      </section>

      {selected && (
        <DayDetail
          dayKey={selected}
          day={selectedDay}
          matches={selectedMatches}
          heroes={heroes}
          timeZone={timeZone}
          closeHref={href({ day: null })}
        />
      )}

      {s.games > 0 && (
        <HeroClimbSection climbs={climbs} heroes={heroes} periodLabel={periodLabel} />
      )}

      <MedalHistorySection history={medals} timeZone={timeZone} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3" aria-labelledby="trend-title">
          <p className="kicker">{t("mmr.page.trendKicker")}</p>
          <h2 id="trend-title" className="mb-3 text-lg font-semibold">
            {t("mmr.page.trendTitle")}
          </h2>
          {entries.length === 0 ? (
            <EmptyJournal text={t("mmr.page.emptyJournal")} />
          ) : (
            <MmrTrendChart
              points={entries.map((e) => ({
                t: e.observedAt.getTime(),
                mmr: e.mmr,
                label: new Intl.DateTimeFormat("en-US", {
                  timeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(e.observedAt),
              }))}
            />
          )}
        </section>

        <section className="panel overflow-hidden lg:col-span-2" aria-labelledby="entries-title">
          <div className="p-5 pb-3">
            <p className="kicker">{t("mmr.page.journalKicker")}</p>
            <h2 id="entries-title" className="text-lg font-semibold">
              {t("mmr.page.entriesTitle")}
            </h2>
          </div>
          {entries.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t("mmr.page.noEntries")}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-white/[0.05] overflow-y-auto border-t border-white/[0.06]">
              {[...entries].reverse().map((e, i, arr) => {
                const prev = arr[i + 1];
                const diff = prev ? e.mmr - prev.mmr : null;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold tabular-nums">
                          {e.mmr.toLocaleString("en-US")}
                        </span>
                        {diff !== null && (
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              diff > 0
                                ? "text-win"
                                : diff < 0
                                  ? "text-loss"
                                  : "text-muted-foreground",
                            )}
                          >
                            {signed(diff)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        <LocalTime iso={e.observedAt.toISOString()} />
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                    <MmrEntryDialog entry={toMmrEntryDto(e)} />
                    <DeleteEntryButton id={e.id} label={`${e.mmr} MMR`} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyJournal({ text }: { text: string }) {
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <CalendarRange aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function fmt(key: DayKey, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

function years(from: DayKey, to: DayKey): number[] {
  const out: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(y);
  return out;
}
