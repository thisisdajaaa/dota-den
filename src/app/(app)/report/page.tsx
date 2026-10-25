import type { Metadata } from "next";
import { CalendarSearch } from "lucide-react";
import { Suspense } from "react";
import { getLocale, getT } from "@/common/i18n/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getViewerTimeZone } from "@/common/http/request-context";
import { dayKeyFormatter } from "@/common/time/day-key";
import { getCurrentUser, type User } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { formatDuration, formatPercent } from "@/modules/matches/ui/format";
import { battleReportService, periodReadService, type ReportReplaysView } from "@/modules/report";
import { PeriodReadCard, type PeriodReadInitial } from "@/modules/report/ui/period-read-card";
import {
  MAX_LOOKBACK_DAYS,
  MAX_RANGE_DAYS,
  parseReportRange,
  REPORT_PERIODS,
  type ReportRange,
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
import { ReportRangeFields } from "@/modules/report/ui/report-range-fields";

/** The widest preset period: the empty state offers it first. */
const LONGEST_PRESET = Math.max(...REPORT_PERIODS);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("report.title") };
}

const MIN_ROLE_GAMES = 5;
const TABS = ["overview", "heroes"] as const;
type Tab = (typeof TABS)[number];

const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
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

export default async function BattleReportPage({ searchParams }: PageProps<"/report">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const [{ timeZone }, heroes, t] = await Promise.all([
    getViewerTimeZone(),
    matchesService.heroMap(),
    getT(),
  ]);
  const today = dayKeyFormatter(timeZone)(new Date());
  const range = parseReportRange(
    { days: one(params.days), from: one(params.from), to: one(params.to) },
    today,
  );
  const tab: Tab = one(params.tab) === "heroes" ? "heroes" : "overview";
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
  // Next step when the range has no games: a wider window, or (already the widest) the sync.
  const emptyAction =
    range.preset !== LONGEST_PRESET
      ? {
          href: href({ days: String(LONGEST_PRESET), ...tabQuery }),
          label: t("report.empty.longer", { n: LONGEST_PRESET }),
        }
      : { href: "/dashboard", label: t("report.empty.overview") };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("report.title")}
        title={t("report.heading")}
        description={t("report.description", { from: fmt(range.from), to: fmt(range.to) })}
      />
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedLinks
          label={t("report.period")}
          options={[
            ...REPORT_PERIODS.map((d) => ({
              value: String(d),
              label: t("report.lastDays", { n: d }),
            })),
            ...(range.preset ? [] : [{ value: "custom", label: t("report.custom") }]),
          ]}
          active={range.preset ? String(range.preset) : "custom"}
          href={(v) => href({ ...(v === "90" || v === "custom" ? {} : { days: v }), ...tabQuery })}
        />
        <form
          method="get"
          action="/report"
          className="flex flex-wrap items-end gap-2"
          aria-label={t("report.customRange")}
        >
          {tab !== "overview" && <input type="hidden" name="tab" value={tab} />}
          <ReportRangeFields
            // A new range from the URL (e.g. a preset link) resets the pickers.
            key={`${range.from}:${range.to}`}
            from={range.from}
            to={range.to}
            today={today}
            maxRangeDays={MAX_RANGE_DAYS}
            maxLookbackDays={MAX_LOOKBACK_DAYS}
            labels={{ from: t("report.from"), to: t("report.to") }}
          />
          <Button type="submit" variant="outline" className="h-10 sm:h-8">
            {t("report.showRange")}
          </Button>
        </form>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {t("report.rangeHelp", { max: MAX_RANGE_DAYS })}
      </p>
      <SegmentedLinks
        label={t("report.sections")}
        options={TABS.map((value) => ({ value, label: t(`report.tabs.${value}`) }))}
        active={tab}
        href={(v) => href({ ...rangeQuery, ...(v === "overview" ? {} : { tab: v }) })}
      />

      {/* Keyed so a new range or tab shows the skeleton instead of the previous report. */}
      <Suspense key={`${range.from}:${range.to}:${tab}`} fallback={<ReportSkeleton />}>
        <ReportBody
          user={user}
          range={range}
          timeZone={timeZone}
          tab={tab}
          heroes={heroes}
          emptyAction={emptyAction}
        />
      </Suspense>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

/** Totals first (one OpenDota list call, or imported games); replay stats stream in after. */
async function ReportBody({
  user,
  range,
  timeZone,
  tab,
  heroes,
  emptyAction,
}: {
  user: User;
  range: ReportRange;
  timeZone: string;
  tab: Tab;
  heroes: Awaited<ReturnType<typeof matchesService.heroMap>>;
  emptyAction: { href: string; label: string };
}) {
  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [view, t, locale] = await Promise.all([
    battleReportService.report(owner, range, timeZone).catch(() => null),
    getT(),
    getLocale(),
  ]);
  // The AI read (Plus): a stored one, or whether one can be written. Never fails the page.
  const read: PeriodReadInitial =
    view && tab === "overview" && view.report.games > 0
      ? await periodReadService
          .view(user, view, locale)
          .then((v): PeriodReadInitial =>
            v.status === "ready"
              ? {
                  status: "ready",
                  read: {
                    points: v.read.points,
                    facts: v.read.facts,
                    createdAt: v.read.createdAt.toISOString(),
                    cached: true,
                  },
                }
              : v,
          )
          .catch((): PeriodReadInitial => ({ status: "off" }))
      : { status: "off" };
  // Replay reads only on the overview, and only when OpenDota answered (imports have none).
  const replays =
    view?.source === "opendota" && tab === "overview" && view.report.games > 0
      ? battleReportService.replays(owner, range, timeZone).catch(() => null)
      : null;

  // Without OpenDota the report is built from imported games: say what's missing.
  const importedNotice = view?.source === "imported" && (
    <p role="status" className="panel p-4 text-sm text-muted-foreground">
      {t("report.imported")}
    </p>
  );

  return !view ? (
    <p role="alert" className="panel p-5 text-sm text-muted-foreground">
      {t("report.unavailable")}
    </p>
  ) : view.report.games === 0 ? (
    <>
      {importedNotice}
      <EmptyState
        icon={CalendarSearch}
        title={t("report.empty.title")}
        description={`${t("report.noGames", { from: fmt(view.from), to: fmt(view.to) })} ${t("report.empty.hint")}`}
        action={emptyAction}
      />
    </>
  ) : tab === "heroes" ? (
    <>
      {importedNotice}
      <HeroTable rows={view.report.heroes} heroes={heroes} />
    </>
  ) : (
    <>
      {importedNotice}
      <section
        aria-label={t("report.tabs.overview")}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        <StatTile
          label={t("report.tiles.games")}
          value={view.report.games.toLocaleString("en-US")}
          detail={`${view.report.wins}–${view.report.games - view.report.wins} · ${formatPercent(view.report.wins / view.report.games)}`}
        />
        <StatTile label={t("report.tiles.heroes")} value={String(view.report.heroesPlayed)} />
        <StatTile
          label={t("report.tiles.avgGame")}
          value={view.report.avgDurationSec ? formatDuration(view.report.avgDurationSec) : "—"}
        />
        <StatTile
          label={t("report.tiles.maxWinStreak")}
          value={String(view.report.maxWinStreak)}
          tone="win"
        />
        <StatTile
          label={t("report.tiles.maxLossStreak")}
          value={String(view.report.maxLossStreak)}
          tone="loss"
        />
        <StatTile
          label={t("report.tiles.mmr")}
          value={
            view.mmrExact !== null
              ? signed(view.mmrExact)
              : view.rankedGames > 0
                ? `≈ ${signed(view.mmrEstimate)}`
                : "—"
          }
          detail={
            view.mmrExact !== null
              ? t("report.tiles.mmrExact")
              : view.rankedGames > 0
                ? t("report.tiles.mmrEstimate")
                : t("report.tiles.noRanked")
          }
        />
      </section>
      <PeriodReadCard from={view.from} to={view.to} initial={read} />

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
          {replays && (
            <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
              <ReplayCard replays={replays} card="lanes" />
            </Suspense>
          )}
        </div>
      </div>
      {replays && (
        <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
          <ReplayCard replays={replays} card="objectives" />
        </Suspense>
      )}
    </>
  );
}

/** One replay card, once the period's parsed replays are read. */
async function ReplayCard({
  replays,
  card,
}: {
  replays: Promise<ReportReplaysView | null>;
  card: "lanes" | "objectives";
}) {
  const r = await replays;
  if (!r) {
    // Shown once (under the lanes); the objectives card just stays out.
    if (card === "objectives") return null;
    const t = await getT();
    return (
      <p role="status" className="panel p-5 text-sm text-muted-foreground">
        {t("report.replays.unavailable")}
      </p>
    );
  }
  return card === "lanes" ? <LanesCard replays={r} /> : <ObjectivesCard replays={r} />;
}
