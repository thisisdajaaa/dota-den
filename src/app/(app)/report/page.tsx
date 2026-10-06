import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { getViewerTimeZone } from "@/common/http/request-context";
import { dayKeyFormatter } from "@/common/time/day-key";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { formatDuration, formatPercent } from "@/modules/matches/ui/format";
import { battleReportService } from "@/modules/report";
import {
  MAX_LOOKBACK_DAYS,
  MAX_RANGE_DAYS,
  parseReportRange,
  REPORT_PERIODS,
} from "@/modules/report/domain/report-range";
import {
  CalendarCard,
  CompareCard,
  HeroesCard,
  HeroTable,
  LanesCard,
  ObjectivesCard,
  RecordsCard,
  RolesCard,
  SidesCard,
} from "@/modules/report/ui/report-sections";
import { addDays } from "@/common/time/day-key";

export const metadata: Metadata = { title: "Battle report" };

const MIN_ROLE_GAMES = 5;
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "heroes", label: "Heroes" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BattleReportPage({ searchParams }: PageProps<"/report">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const [{ timeZone }, heroes] = await Promise.all([getViewerTimeZone(), matchesService.heroMap()]);
  const today = dayKeyFormatter(timeZone)(new Date());
  const range = parseReportRange(
    { days: one(params.days), from: one(params.from), to: one(params.to) },
    today,
  );
  const tab: Tab = one(params.tab) === "heroes" ? "heroes" : "overview";
  const view = await battleReportService
    .report({ userId: user.id, accountId32: user.accountId32 }, range, timeZone)
    .catch(() => null);

  const fmt = (k: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${k}T12:00:00Z`));
  const short = (k: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${k}T12:00:00Z`),
    );
  // Every view is a shareable URL: the range (preset or custom) and the tab.
  const rangeQuery: Record<string, string> = range.preset
    ? range.preset === 90
      ? {}
      : { days: String(range.preset) }
    : { from: range.from, to: range.to };
  const href = (q: Record<string, string | undefined>) => {
    const search = new URLSearchParams(
      Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined),
    ).toString();
    return search ? `/report?${search}` : "/report";
  };
  const tabQuery: Record<string, string> = tab === "overview" ? {} : { tab };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Battle report"
        title="Your battle report"
        description={
          view
            ? `${fmt(view.from)} to ${fmt(view.to)}: all your public games, from OpenDota.`
            : "Your games over a period, from OpenDota."
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedLinks
          label="Period"
          options={[
            ...REPORT_PERIODS.map((d) => ({ value: String(d), label: `Last ${d} days` })),
            ...(range.preset ? [] : [{ value: "custom", label: "Custom" }]),
          ]}
          active={range.preset ? String(range.preset) : "custom"}
          href={(v) => href({ ...(v === "90" || v === "custom" ? {} : { days: v }), ...tabQuery })}
        />
        <form
          method="get"
          action="/report"
          className="flex flex-wrap items-end gap-2"
          aria-label="Custom range"
        >
          {tab !== "overview" && <input type="hidden" name="tab" value={tab} />}
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              name="from"
              required
              defaultValue={range.from}
              min={addDays(today, -MAX_LOOKBACK_DAYS)}
              max={today}
              className="h-8 rounded-md border border-white/10 bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              name="to"
              required
              defaultValue={range.to}
              max={today}
              className="h-8 rounded-md border border-white/10 bg-background px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" variant="outline" size="sm">
            Show range
          </Button>
        </form>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Custom ranges cover up to {MAX_RANGE_DAYS} days within the last two years.
      </p>
      <SegmentedLinks
        label="Report sections"
        options={TABS}
        active={tab}
        href={(v) => href({ ...rangeQuery, ...(v === "overview" ? {} : { tab: v }) })}
      />

      {!view ? (
        <p role="alert" className="panel p-5 text-sm text-muted-foreground">
          The report is unavailable right now (OpenDota didn&apos;t answer). Try again in a minute.
        </p>
      ) : view.report.games === 0 ? (
        <p className="panel p-5 text-sm text-muted-foreground">
          No public games between {fmt(view.from)} and {fmt(view.to)}.
        </p>
      ) : tab === "heroes" ? (
        <HeroTable rows={view.report.heroes} heroes={heroes} />
      ) : (
        <>
          <section aria-label="Overview" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatTile
              label="Games played"
              value={view.report.games.toLocaleString("en-US")}
              detail={`${view.report.wins}–${view.report.games - view.report.wins} · ${formatPercent(view.report.wins / view.report.games)}`}
            />
            <StatTile label="Heroes played" value={String(view.report.heroesPlayed)} />
            <StatTile
              label="Average game"
              value={view.report.avgDurationSec ? formatDuration(view.report.avgDurationSec) : "—"}
            />
            <StatTile label="Max win streak" value={String(view.report.maxWinStreak)} tone="win" />
            <StatTile
              label="Max loss streak"
              value={String(view.report.maxLossStreak)}
              tone="loss"
            />
            <StatTile
              label="Ranked MMR change"
              value={
                view.mmrExact !== null
                  ? signed(view.mmrExact)
                  : view.rankedGames > 0
                    ? `≈ ${signed(view.mmrEstimate)}`
                    : "—"
              }
              detail={
                view.mmrExact !== null
                  ? "Exact, from your MMR entries"
                  : view.rankedGames > 0
                    ? "Estimate: ±25 per ranked game"
                    : "No ranked games"
              }
            />
          </section>

          <CompareCard
            current={view.current}
            previous={view.previous.totals}
            previousLabel={`${short(view.previous.from)} – ${short(view.previous.to)}`}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SidesCard sides={view.report.sides} />
            <CalendarCard days={view.report.days} from={view.from} to={view.to} />
          </div>
          <RecordsCard records={view.report.records} heroes={heroes} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <HeroesCard rows={view.report.heroes} heroes={heroes} />
            </div>
            <div className="space-y-6 lg:col-span-2">
              {view.report.roles.withData >= MIN_ROLE_GAMES && (
                <RolesCard roles={view.report.roles} games={view.report.games} />
              )}
              <LanesCard replays={view.replays} />
            </div>
          </div>
          <ObjectivesCard replays={view.replays} />
        </>
      )}
    </div>
  );
}
