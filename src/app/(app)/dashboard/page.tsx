import type { Metadata } from "next";
import { Suspense } from "react";
import { afterResponse } from "@/common/http/after-response";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { CollapsibleSection } from "@/components/collapsible-section";
import { StatTile } from "@/components/stat-tile";
import { getCurrentUser } from "@/modules/identity";
import { BACKFILL_COOLDOWN_MS, MatchSyncService, SYNC_COOLDOWN_MS } from "@/modules/matches";
import type { DashboardFilter } from "@/modules/matches/domain/read-models";
import { matchQueries, matchesService } from "@/modules/matches";
import { playersService } from "@/modules/players";
import { summarizeMatches } from "@/modules/matches/domain/match-summary";
import { DashboardFilters } from "@/modules/matches/ui/dashboard-filters";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { FormStrip } from "@/modules/matches/ui/form-strip";
import { PlayerBanner } from "@/modules/matches/ui/player-banner";
import { QueueSplitCard } from "@/modules/matches/ui/queue-split-card";
import { RecentMatchesCard } from "@/modules/matches/ui/recent-matches-card";
import { SyncControl } from "@/modules/matches/ui/sync-control";
import { HeroPoolCard } from "@/modules/matches/ui/hero-pool-card";
import { getViewerTimeZone } from "@/common/http/request-context";
import { medalService } from "@/modules/mmr";
import { notificationService } from "@/modules/notifications";
import { NotificationsPrompt } from "@/modules/notifications/ui/notifications-prompt";
import { onboardingService } from "@/modules/onboarding";
import { OnboardingChecklist } from "@/modules/onboarding/ui/onboarding-checklist";
import { sessionService } from "@/modules/sessions";
import { LatestSessionCard } from "@/modules/sessions/ui/latest-session-card";
import { TeammatesSkeleton } from "@/modules/together/ui/teammates-summary";
import { StandingSkeleton } from "@/modules/leaderboards/ui/standing-card";
import { AchievementsSection } from "./achievements-section";
import { FirstRunStatus, WhileYouWait, type FirstRunStage } from "./first-run";
import { FriendsPlayingSection } from "./friends-playing-section";
import { GoalsSection } from "./goals-section";
import { LanesSection, LanesSkeleton } from "./lanes-section";
import { MmrPromptSection } from "./mmr-prompt-section";
import { PracticeSection } from "./practice-section";
import { TiltSection } from "./tilt-section";
import { WeeklyRecapSection } from "./weekly-recap-section";
import { PatchDigestSection, PatchDigestSkeleton } from "./patch-digest-section";
import { StandingSection } from "./standing-section";
import { TeammatesSection } from "./teammates-section";

/** Games in the recent matches card. */
const RECENT_MATCHES = 12;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.title") };
}

const FORM_LENGTH = 12;

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
  const t = await getT();

  const queries = matchQueries;
  const owner = { userId: user.id, accountId32: user.accountId32 };
  const timeZone = getViewerTimeZone();
  const [status, view, quick, heroes, latestSession, tz, notify, checklist] = await Promise.all([
    queries.importStatus(user.accountId32),
    queries.dashboardView(user.accountId32, filter, now, RECENT_MATCHES),
    // The saved copy when there is one: the banner doesn't wait on OpenDota.
    playersService.quickProfile(user.accountId32),
    matchesService.heroMap(),
    // Optional card: a sessions failure must not take down the dashboard.
    sessionService.latest({ userId: user.id, accountId32: user.accountId32 }).catch(() => null),
    timeZone,
    // Optional: only decides whether to invite the player to turn notifications on.
    notificationService.status(user.id).catch(() => null),
    // Optional card: a failure just hides the checklist.
    timeZone
      .then((zone) =>
        onboardingService.checklist({ ...owner, createdAt: user.createdAt }, zone.timeZone),
      )
      .catch(() => null),
  ]);
  const { facts, recent, latestPatch } = view;
  const profile = quick.profile;
  // Medal history needs no typing: note the medal each visit (after the page is sent), from a
  // live profile only. A saved banner copy is refreshed first.
  afterResponse(
    "record_medal",
    async () => {
      const live = quick.saved ? await playersService.refreshProfile(user.accountId32) : profile;
      if (live) await medalService.record(user.accountId32, live.rankTier);
    },
    { accountId32: user.accountId32 },
  );

  // Every hero in view (the card sorts and expands client-side); 12 form tiles fill 6×2.
  const summary = summarizeMatches(facts, {
    topHeroes: Number.POSITIVE_INFINITY,
    formLength: FORM_LENGTH,
  });
  const { overall, averages, byQueue } = summary;
  const sync = status.sync;
  const top = summary.heroes[0];
  const topHero = top ? heroes.get(top.heroId) : undefined;
  const signature =
    top && topHero ? { hero: topHero, games: top.games, winRate: top.winRate } : null;
  const hasAnyMatches = status.totals.all > 0;

  const banner = (
    <PlayerBanner profile={profile} accountId32={user.accountId32} signature={signature}>
      <SyncControl
        stale={MatchSyncService.isStale(sync, now)}
        backfillComplete={sync?.backfillComplete ?? false}
        backfillCooldownMs={BACKFILL_COOLDOWN_MS}
        recheckMs={SYNC_COOLDOWN_MS}
        awaitingHistory={!hasAnyMatches}
        lastSyncedLabel={sync?.lastSyncAt ? formatAgo(sync.lastSyncAt, now) : null}
      />
    </PlayerBanner>
  );
  const goals = (
    <Suspense fallback={null}>
      <GoalsSection user={user} heroes={heroes} timeZone={tz.timeZone} />
    </Suspense>
  );

  if (!hasAnyMatches) {
    // First run: only what helps while the history arrives. Panels that would read 0 or —
    // (stats, lanes, teammates, standings, achievements) wait until there are games.
    const stage: FirstRunStage = !sync?.lastSyncAt
      ? "first_sync"
      : sync.historyRefreshRequestedAt &&
          now.getTime() - sync.historyRefreshRequestedAt.getTime() < 2 * 3_600_000
        ? "fetching"
        : "no_public_data";
    return (
      <div className="space-y-6">
        {banner}
        <Suspense fallback={null}>
          <FriendsPlayingSection user={user} />
        </Suspense>
        {checklist && <OnboardingChecklist steps={checklist} />}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <FirstRunStatus
              stage={stage}
              requestedAt={sync?.historyRefreshRequestedAt ?? null}
              lastSyncAt={sync?.lastSyncAt ?? null}
              now={now}
            />
          </div>
          <div className="lg:col-span-2">
            <WhileYouWait />
          </div>
        </div>
        {/* Goals are the player's own choice, so they can be set before any game arrives. */}
        {goals}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {banner}

      {/* Steam presence: hidden when nobody is playing or no Steam Web API key is set. */}
      <Suspense fallback={null}>
        <FriendsPlayingSection user={user} />
      </Suspense>

      {latestSession && (
        <LatestSessionCard {...latestSession} heroes={heroes} timeZone={tz.timeZone} />
      )}

      <Suspense fallback={null}>
        <TiltSection user={user} />
      </Suspense>

      <Suspense fallback={null}>
        <WeeklyRecapSection user={user} heroes={heroes} timeZone={tz.timeZone} />
      </Suspense>

      <Suspense fallback={null}>
        <MmrPromptSection user={user} />
      </Suspense>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DashboardFilters filter={filter} latestPatch={latestPatch} />
        <p className="text-xs text-muted-foreground tabular-nums">
          {plural(t, "dashboard.showing", status.totals.all, {
            shown: overall.games.toLocaleString("en-US"),
          })}
        </p>
      </div>

      {overall.games === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("dashboard.noneInView")}
        </div>
      ) : (
        <>
          <section
            aria-label={t("dashboard.keyStats")}
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            <StatTile
              label={t("dashboard.winRate")}
              value={formatPercent(overall.winRate)}
              meter={overall.winRate}
              tone={overall.winRate !== null && overall.winRate >= 0.5 ? "win" : "loss"}
              detail={`${plural(t, "dashboard.wins", overall.wins)} · ${plural(t, "dashboard.losses", overall.losses)}`}
            />
            <StatTile
              label={t("dashboard.soloWinRate")}
              value={formatPercent(byQueue.solo.winRate)}
              meter={byQueue.solo.winRate}
              tone={byQueue.solo.lowSample ? "muted" : "gold"}
              detail={`${plural(t, "dashboard.soloGames", byQueue.solo.games)}${byQueue.solo.lowSample ? t("dashboard.tooFew") : ""}`}
            />
            <StatTile
              label={t("dashboard.partyWinRate")}
              value={formatPercent(byQueue.party.winRate)}
              meter={byQueue.party.winRate}
              tone={byQueue.party.lowSample ? "muted" : "gold"}
              detail={`${plural(t, "dashboard.partyGames", byQueue.party.games)}${byQueue.party.lowSample ? t("dashboard.tooFew") : ""}`}
            />
            <StatTile
              label={t("dashboard.kdaRatio")}
              value={averages ? averages.kda.toFixed(2) : "—"}
              detail={
                averages
                  ? t("dashboard.averages", {
                      kills: averages.kills.toFixed(1),
                      deaths: averages.deaths.toFixed(1),
                      assists: averages.assists.toFixed(1),
                    })
                  : undefined
              }
            />
          </section>

          {/* The tall queue card beside the hero pool and recent form; the queue card
              stretches to the column's height, so neither side leaves a hole. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 lg:[&>section]:h-full">
              <QueueSplitCard summary={summary} />
            </div>
            <div className="space-y-6 lg:col-span-2">
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
              <FormStrip form={summary.form} heroes={heroes} />
            </div>
          </div>
        </>
      )}

      {/* Below the numbers: first steps, the week's goals (yours) and practice plan (suggested). */}
      {checklist ? (
        <OnboardingChecklist steps={checklist} />
      ) : (
        latestSession && notify?.enabled && notify.endpoints.length === 0 && <NotificationsPrompt />
      )}
      <CollapsibleSection storageKey="dashboard-plan" title={t("dashboard.plan.title")}>
        {/* Goals are short and practice is long: a narrower goals column, both cards the
            row's height. Either may render nothing; the other then takes the full width. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:[&:has(>:empty)>*]:col-span-5">
          <div className="empty:hidden lg:col-span-2 lg:[&>section]:h-full">{goals}</div>
          <div className="empty:hidden lg:col-span-3 lg:[&>section]:h-full">
            <Suspense fallback={null}>
              <PracticeSection user={user} heroes={heroes} timeZone={tz.timeZone} />
            </Suspense>
          </div>
        </div>
      </CollapsibleSection>

      {overall.games > 0 && <RecentMatchesCard matches={recent} heroes={heroes} now={now} />}

      {/* From OpenDota's lane data (last 60 days), not the filters above. */}
      <Suspense fallback={<PatchDigestSkeleton />}>
        <PatchDigestSection user={user} />
      </Suspense>

      <Suspense fallback={<LanesSkeleton />}>
        <LanesSection accountId32={user.accountId32} />
      </Suspense>

      {/* From OpenDota, not the filters above: streams in without holding up the page. */}
      <Suspense fallback={<TeammatesSkeleton />}>
        <TeammatesSection user={user} />
      </Suspense>

      {/* Your all-time rank on each friends leaderboard. */}
      <Suspense fallback={<StandingSkeleton />}>
        <StandingSection user={user} />
      </Suspense>

      <Suspense fallback={null}>
        <AchievementsSection user={user} timeZone={tz.timeZone} />
      </Suspense>
    </div>
  );
}
