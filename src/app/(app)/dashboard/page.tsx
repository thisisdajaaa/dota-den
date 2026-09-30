import type { Metadata } from "next";
import { Suspense } from "react";
import { Swords } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity/composition";
import {
  BACKFILL_COOLDOWN_MS,
  MatchSyncService,
  SYNC_COOLDOWN_MS,
} from "@/modules/matches/application/match-sync-service";
import type { DashboardFilter } from "@/modules/matches/application/ports";
import { getHeroMap, getMatchQueries, getPlayerProfile } from "@/modules/matches/composition";
import { summarizeMatches } from "@/modules/matches/domain/match-summary";
import { DashboardFilters } from "@/modules/matches/ui/dashboard-filters";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
import { FormStrip } from "@/modules/matches/ui/form-strip";
import { PlayerBanner } from "@/modules/matches/ui/player-banner";
import { QueueSplitCard } from "@/modules/matches/ui/queue-split-card";
import { RecentMatchesCard } from "@/modules/matches/ui/recent-matches-card";
import { SyncControl } from "@/modules/matches/ui/sync-control";
import { HeroPoolCard } from "@/modules/matches/ui/hero-pool-card";
import { getViewerTimeZone } from "@/modules/mmr/composition";
import { getSessionService } from "@/modules/sessions/composition";
import { LatestSessionCard } from "@/modules/sessions/ui/latest-session-card";
import { TeammatesSkeleton } from "@/modules/together/ui/teammates-summary";
import { LanesSection, LanesSkeleton } from "./lanes-section";
import { TeammatesSection } from "./teammates-section";

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
  const [status, { facts, latestPatch }, profile, heroes, latestSession, tz] = await Promise.all([
    queries.importStatus(user.accountId32),
    queries.dashboardFacts(user.accountId32, filter, now),
    getPlayerProfile(user.accountId32),
    getHeroMap(),
    // Optional card: a sessions failure must not take down the dashboard.
    getSessionService()
      .then((s) => s.latest({ userId: user.id, accountId32: user.accountId32 }))
      .catch(() => null),
    getViewerTimeZone(),
  ]);

  // Every hero in view (the card sorts and expands client-side).
  const summary = summarizeMatches(facts, { topHeroes: Number.POSITIVE_INFINITY });
  const { overall, averages, byQueue } = summary;
  const sync = status.sync;
  const top = summary.heroes[0];
  const topHero = top ? heroes.get(top.heroId) : undefined;
  const signature =
    top && topHero ? { hero: topHero, games: top.games, winRate: top.winRate } : null;
  const hasAnyMatches = status.totals.all > 0;

  return (
    <div className="space-y-6">
      <PlayerBanner profile={profile} accountId32={user.accountId32} signature={signature}>
        <SyncControl
          stale={MatchSyncService.isStale(sync, now)}
          backfillComplete={sync?.backfillComplete ?? false}
          backfillCooldownMs={BACKFILL_COOLDOWN_MS}
          recheckMs={SYNC_COOLDOWN_MS}
          awaitingHistory={!hasAnyMatches && sync?.lastSyncAt != null}
          lastSyncedLabel={sync?.lastSyncAt ? formatAgo(sync.lastSyncAt, now) : null}
        />
      </PlayerBanner>

      {latestSession && (
        <LatestSessionCard {...latestSession} heroes={heroes} timeZone={tz.timeZone} />
      )}

      {!hasAnyMatches ? (
        <EmptyState
          stage={
            !sync?.lastSyncAt
              ? "first_sync"
              : sync.historyRefreshRequestedAt &&
                  now.getTime() - sync.historyRefreshRequestedAt.getTime() < 2 * 3_600_000
                ? "fetching"
                : "no_public_data"
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DashboardFilters filter={filter} latestPatch={latestPatch} />
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {overall.games.toLocaleString()} of your {status.totals.all.toLocaleString()}{" "}
              matches
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
                  detail={`${plural(overall.wins, "win")} · ${plural(overall.losses, "loss")}`}
                />
                <StatTile
                  label="Solo win rate"
                  value={formatPercent(byQueue.solo.winRate)}
                  meter={byQueue.solo.winRate}
                  tone={byQueue.solo.lowSample ? "muted" : "gold"}
                  detail={`${plural(byQueue.solo.games, "solo game")}${byQueue.solo.lowSample ? " · too few to judge" : ""}`}
                />
                <StatTile
                  label="Party win rate"
                  value={formatPercent(byQueue.party.winRate)}
                  meter={byQueue.party.winRate}
                  tone={byQueue.party.lowSample ? "muted" : "gold"}
                  detail={`${plural(byQueue.party.games, "party game")}${byQueue.party.lowSample ? " · too few to judge" : ""}`}
                />
                <StatTile
                  label="KDA ratio"
                  value={averages ? averages.kda.toFixed(2) : "—"}
                  detail={
                    averages
                      ? `Avg ${averages.kills.toFixed(1)} kills · ${averages.deaths.toFixed(1)} deaths · ${averages.assists.toFixed(1)} assists`
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
                  <HeroPoolCard
                    rows={summary.heroes.map((h) => ({
                      ...h,
                      lastPlayed: h.lastPlayed.toISOString(),
                    }))}
                    heroes={summary.heroes
                      .map((h) => heroes.get(h.heroId))
                      .filter((h) => h !== undefined)}
                    now={now.toISOString()}
                  />
                </div>
              </div>

              <RecentMatchesCard matches={facts.slice(0, 12)} heroes={heroes} now={now} />
            </>
          )}
        </>
      )}

      {/* From OpenDota's lane data (last 60 days), not the filters above. */}
      <Suspense fallback={<LanesSkeleton />}>
        <LanesSection accountId32={user.accountId32} />
      </Suspense>

      {/* From OpenDota, not the filters above: streams in without holding up the page. */}
      <Suspense fallback={<TeammatesSkeleton />}>
        <TeammatesSection user={user} />
      </Suspense>
    </div>
  );
}

const EMPTY_COPY = {
  first_sync: {
    title: "Summoning your match history…",
    body: "We're importing your games from OpenDota. This page updates automatically.",
  },
  fetching: {
    title: "OpenDota is fetching your match history",
    body: "We've asked OpenDota to pull your games from Steam. This usually takes a few minutes, sometimes longer for big histories. You can leave this page open: it checks again automatically.",
  },
  no_public_data: {
    title: "No public matches found yet",
    body: "OpenDota still has no games for this account. In Dota 2, go to Settings → Options → Social and turn on “Expose Public Match Data”. We ask OpenDota to re-fetch your history every few hours, and it also picks up games you play from now on.",
  },
} as const;

function EmptyState({ stage }: { stage: keyof typeof EMPTY_COPY }) {
  const copy = EMPTY_COPY[stage];
  return (
    <section
      className="panel grid place-items-center gap-3 px-6 py-16 text-center"
      aria-live="polite"
    >
      <span className="grid size-14 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Swords aria-hidden className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{copy.body}</p>
    </section>
  );
}
