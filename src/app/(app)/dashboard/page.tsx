import type { Metadata } from "next";
import { Swords } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity/composition";
import {
  BACKFILL_COOLDOWN_MS,
  MatchSyncService,
} from "@/modules/matches/application/match-sync-service";
import type { DashboardFilter } from "@/modules/matches/application/ports";
import { getHeroMap, getMatchQueries, getPlayerProfile } from "@/modules/matches/composition";
import { summarizeMatches } from "@/modules/matches/domain/match-summary";
import { DashboardFilters } from "@/modules/matches/ui/dashboard-filters";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { FormStrip } from "@/modules/matches/ui/form-strip";
import { PlayerBanner } from "@/modules/matches/ui/player-banner";
import { QueueSplitCard } from "@/modules/matches/ui/queue-split-card";
import { RecentMatchesCard } from "@/modules/matches/ui/recent-matches-card";
import { SyncControl } from "@/modules/matches/ui/sync-control";
import { TopHeroesCard } from "@/modules/matches/ui/top-heroes-card";

export const metadata: Metadata = { title: "Dashboard" };

function parseFilter(params: Record<string, string | string[] | undefined>): DashboardFilter {
  const range = params.range;
  const mode = params.mode;
  return {
    range: range === "patch" || range === "30d" ? range : "all",
    mode: mode === "ranked" ? "ranked" : "all",
  };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const filter = parseFilter(await searchParams);
  const now = new Date();

  const queries = await getMatchQueries();
  const [status, { facts, latestPatch }, profile, heroes] = await Promise.all([
    queries.importStatus(user.accountId32),
    queries.dashboardFacts(user.accountId32, filter, now),
    getPlayerProfile(user.accountId32),
    getHeroMap(),
  ]);

  const summary = summarizeMatches(facts);
  const { overall, averages, byQueue } = summary;
  const sync = status.sync;
  const hasAnyMatches = status.totals.all > 0;

  return (
    <div className="space-y-6">
      <PlayerBanner profile={profile} accountId32={user.accountId32}>
        <SyncControl
          stale={MatchSyncService.isStale(sync, now)}
          backfillComplete={sync?.backfillComplete ?? false}
          backfillCooldownMs={BACKFILL_COOLDOWN_MS}
          lastSyncedLabel={sync?.lastSyncAt ? formatAgo(sync.lastSyncAt, now) : null}
        />
      </PlayerBanner>

      {!hasAnyMatches ? (
        <EmptyState syncing={!sync?.lastSyncAt} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DashboardFilters filter={filter} latestPatch={latestPatch} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {overall.games} of {status.totals.all} imported matches in view
            </p>
          </div>

          {overall.games === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              No matches in this view. Try a wider time range.
            </div>
          ) : (
            <>
              <section aria-label="Key stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Win rate"
                  value={formatPercent(overall.winRate)}
                  meter={overall.winRate}
                  tone={overall.winRate !== null && overall.winRate >= 0.5 ? "win" : "loss"}
                  detail={`${overall.wins}W · ${overall.losses}L · n=${overall.games}`}
                />
                <StatTile
                  label="Solo win rate"
                  value={formatPercent(byQueue.solo.winRate)}
                  meter={byQueue.solo.winRate}
                  tone={byQueue.solo.lowSample ? "muted" : "gold"}
                  detail={`n=${byQueue.solo.games}${byQueue.solo.lowSample ? " · low sample" : ""}`}
                />
                <StatTile
                  label="Party win rate"
                  value={formatPercent(byQueue.party.winRate)}
                  meter={byQueue.party.winRate}
                  tone={byQueue.party.lowSample ? "muted" : "gold"}
                  detail={`n=${byQueue.party.games}${byQueue.party.lowSample ? " · low sample" : ""}`}
                />
                <StatTile
                  label="KDA"
                  value={averages ? averages.kda.toFixed(2) : "—"}
                  detail={
                    averages
                      ? `${averages.kills.toFixed(1)} / ${averages.deaths.toFixed(1)} / ${averages.assists.toFixed(1)} avg`
                      : undefined
                  }
                />
              </section>

              <div className="grid gap-6 lg:grid-cols-5">
                <div className="space-y-6 lg:col-span-3">
                  <QueueSplitCard summary={summary} />
                  <FormStrip form={summary.form} heroes={heroes} />
                </div>
                <div className="lg:col-span-2">
                  <TopHeroesCard summary={summary} heroes={heroes} />
                </div>
              </div>

              <RecentMatchesCard matches={facts.slice(0, 12)} heroes={heroes} now={now} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ syncing }: { syncing: boolean }) {
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Swords aria-hidden className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">
        {syncing ? "Summoning your match history…" : "No matches found"}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {syncing
          ? "We're importing your games from OpenDota. This page updates automatically."
          : "OpenDota has no public matches for this account yet. In Dota 2, enable “Expose Public Match Data”, play a game, and we'll pick it up on your next visit."}
      </p>
    </section>
  );
}
