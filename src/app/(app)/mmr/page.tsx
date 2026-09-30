import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn } from "cn";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity/composition";
import { getHeroMap, getMatchQueries } from "@/modules/matches/composition";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { toMmrEntryDto } from "@/modules/mmr/application/contracts";
import { getMmrJournal, getViewerTimeZone } from "@/modules/mmr/composition";
import {
  buildCalendar,
  dayValue,
  ESTIMATE_PER_GAME,
  type QueueScope,
} from "@/modules/mmr/domain/calendar";
import { dayKeyFormatter, type DayKey } from "@/modules/mmr/domain/day-key";
import { climbByHero } from "@/modules/mmr/domain/hero-climb";
import { isDayKey, periodFor, type CalendarView } from "@/modules/mmr/domain/periods";
import { CalendarLegend } from "@/modules/mmr/ui/calendar-legend";
import { DayDetail } from "@/modules/mmr/ui/day-detail";
import { DeleteEntryButton } from "@/modules/mmr/ui/delete-entry-button";
import { HeroClimbSection } from "@/modules/mmr/ui/hero-climb-section";
import { MmrEntryDialog } from "@/modules/mmr/ui/mmr-entry-dialog";
import { MmrTrendChart } from "@/modules/mmr/ui/mmr-trend-chart";
import { MonthGrid } from "@/modules/mmr/ui/month-grid";
import { WeekView } from "@/modules/mmr/ui/week-view";
import { YearHeatmap } from "@/modules/mmr/ui/year-heatmap";

export const metadata: Metadata = { title: "MMR journal" };

const VIEWS: ReadonlyArray<{ value: CalendarView; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
];
const SCOPES: ReadonlyArray<{ value: QueueScope; label: string }> = [
  { value: "all", label: "All ranked" },
  { value: "solo", label: "Solo" },
  { value: "party", label: "Party" },
];

const TZ_PAD_MS = 15 * 60 * 60 * 1000; // wider than any UTC offset

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0";
}

export default async function MmrPage({ searchParams }: PageProps<"/mmr">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const { timeZone } = await getViewerTimeZone();
  const dayKey = dayKeyFormatter(timeZone);
  const now = new Date();
  const today = dayKey(now);

  const viewParam = one(params.view);
  const view: CalendarView = VIEWS.some((v) => v.value === viewParam)
    ? (viewParam as CalendarView)
    : "month";
  const scopeParam = one(params.scope);
  const scope: QueueScope = SCOPES.some((s) => s.value === scopeParam)
    ? (scopeParam as QueueScope)
    : "all";
  const anchorParam = one(params.date);
  const anchor = isDayKey(anchorParam) ? anchorParam : today;
  const selectedParam = one(params.day);
  const selected = isDayKey(selectedParam) ? selectedParam : null;

  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [journal, queries, heroes] = await Promise.all([
    getMmrJournal(),
    getMatchQueries(),
    getHeroMap(),
  ]);
  const entries = await journal.list(owner);

  // All-time starts at the earliest entry or ranked game we know about.
  const earliestMatch =
    view === "all"
      ? await queries.rankedResults(user.accountId32, { from: new Date(0), to: now })
      : [];
  const earliestKeys = [
    ...entries.slice(0, 1).map((e) => dayKey(e.observedAt)),
    ...earliestMatch.map((m) => dayKey(m.startedAt)),
  ].sort();
  const period = periodFor(view, anchor, today, earliestKeys[0] ?? null);

  const rangeFrom = new Date(Date.parse(`${period.from}T00:00:00Z`) - TZ_PAD_MS);
  const rangeTo = new Date(Date.parse(`${period.to}T23:59:59Z`) + TZ_PAD_MS);
  const matches =
    view === "all"
      ? earliestMatch
      : await queries.rankedResults(user.accountId32, { from: rangeFrom, to: rangeTo });

  const calendar = buildCalendar({
    observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
    matches,
    period: { from: period.from, to: period.to },
    dayKey,
    scope,
  });
  const s = calendar.summary;
  const climbs = climbByHero({
    observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
    matches,
    scope,
    loaded: view === "all" ? { from: new Date(0), to: now } : { from: rangeFrom, to: rangeTo },
    inPeriod: (d) => {
      const k = dayKey(d);
      return k >= period.from && k <= period.to;
    },
  });

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
          : `Since ${fmt(period.from, { month: "long", year: "numeric" })}`;

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
        kicker="Progression"
        title="MMR journal"
        description="Log the MMR your Dota client shows. We match it against your ranked games to show exactly where you gained and lost it."
        actions={<MmrEntryDialog />}
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Current MMR"
          value={current ? current.mmr.toLocaleString("en-US") : "—"}
          detail={
            current ? `Logged ${formatAgo(current.observedAt, now)}` : "Log your MMR to start"
          }
          tone="gold"
        />
        <StatTile
          label={`Change · ${periodLabel}`}
          value={periodChange}
          detail={
            s.actualNet !== null
              ? "Exact, from your entries"
              : s.games > 0
                ? `Estimate: ±${ESTIMATE_PER_GAME} per ranked game`
                : "No ranked games"
          }
        />
        <StatTile
          label="Ranked record"
          value={s.games ? `${s.wins}–${s.losses}` : "—"}
          detail={s.games ? `${formatPercent(s.winRate)} win rate` : "No ranked games"}
          meter={s.winRate}
          tone={s.winRate !== null && s.winRate >= 0.5 ? "win" : "loss"}
        />
        <StatTile
          label="Best / worst day"
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
                    ? "estimated"
                    : "exact",
                ].join(" · ")
              : "Play some ranked games"
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
                aria-label="Previous period"
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
                aria-label="Next period"
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
                Today
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <SegmentedLinks
              label="Calendar view"
              options={VIEWS}
              active={view}
              href={(v) => href({ view: v, day: null })}
            />
            <SegmentedLinks
              label="Queue"
              options={SCOPES}
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
            Dota doesn&apos;t track MMR separately for solo and party, so exact changes only show on
            days where every ranked game was {scope}. Other days use the estimate.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3" aria-labelledby="trend-title">
          <p className="kicker">Trend</p>
          <h2 id="trend-title" className="mb-3 text-lg font-semibold">
            Logged MMR
          </h2>
          {entries.length === 0 ? (
            <EmptyJournal />
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
            <p className="kicker">Journal</p>
            <h2 id="entries-title" className="text-lg font-semibold">
              Your entries
            </h2>
          </div>
          {entries.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No entries yet.</p>
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

function EmptyJournal() {
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <CalendarRange aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm text-sm text-muted-foreground">
        Log your MMR from the Dota client, ideally before and after each session. The more often you
        log, the more days show an exact change instead of an estimate.
      </p>
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
