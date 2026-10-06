import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity";
import { getHeroMap } from "@/modules/matches/composition";
import { formatDuration, formatPercent } from "@/modules/matches/ui/format";
import { getViewerTimeZone } from "@/modules/mmr/composition";
import { getBattleReport, REPORT_PERIODS, type ReportPeriod } from "@/modules/report/composition";
import {
  CalendarCard,
  HeroesCard,
  RecordsCard,
  RolesCard,
  SidesCard,
} from "@/modules/report/ui/report-sections";

export const metadata: Metadata = { title: "Battle report" };

const MIN_ROLE_GAMES = 5;
const signed = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("en-US")}`;

export default async function BattleReportPage({ searchParams }: PageProps<"/report">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const raw = Number((await searchParams).days);
  const days: ReportPeriod = (REPORT_PERIODS as readonly number[]).includes(raw)
    ? (raw as ReportPeriod)
    : 90;
  const [{ timeZone }, heroes] = await Promise.all([getViewerTimeZone(), getHeroMap()]);
  const view = await getBattleReport(user, days, timeZone).catch(() => null);
  const fmt = (k: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${k}T12:00:00Z`));

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
      <SegmentedLinks
        label="Period"
        options={REPORT_PERIODS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
        active={String(days)}
        href={(v) => (v === "90" ? "/report" : `/report?days=${v}`)}
      />

      {!view ? (
        <p role="alert" className="panel p-5 text-sm text-muted-foreground">
          The report is unavailable right now (OpenDota didn&apos;t answer). Try again in a minute.
        </p>
      ) : view.report.games === 0 ? (
        <p className="panel p-5 text-sm text-muted-foreground">
          No public games in the last {days} days.
        </p>
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SidesCard sides={view.report.sides} />
            <CalendarCard days={view.report.days} from={view.from} to={view.to} />
          </div>
          <RecordsCard records={view.report.records} heroes={heroes} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <HeroesCard rows={view.report.heroes} heroes={heroes} />
            </div>
            <div className="lg:col-span-2">
              {view.report.roles.withData >= MIN_ROLE_GAMES && (
                <RolesCard roles={view.report.roles} games={view.report.games} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
