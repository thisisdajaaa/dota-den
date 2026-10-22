import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { FilterSheet } from "@/components/filter-sheet";
import { SegmentedLinks } from "@/components/segmented-links";
import { heroesService } from "@/modules/heroes";
import {
  matchupsHref,
  parseMatchupsFilter,
  type MatchupsFilter,
} from "@/modules/heroes/schemas/matchups-filter.schema";
import { LineupProgressNote, OwnMatchupsSections } from "@/modules/heroes/ui/own-matchups";
import { getCurrentUser } from "@/modules/identity";
import {
  BACKFILL_COOLDOWN_MS,
  MatchSyncService,
  SYNC_COOLDOWN_MS,
  matchQueries,
  matchesService,
} from "@/modules/matches";
import { formatAgo } from "@/modules/matches/ui/format";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { SyncControl } from "@/modules/matches/ui/sync-control";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.own.metaTitle") };
}

/** Who you lose to: matchups counted from the lineups of your own imported games. */
export default async function MatchupsPage({ searchParams }: PageProps<"/heroes/matchups">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const filter = parseMatchupsFilter(await searchParams);
  const t = await getT();
  const now = new Date();

  const [view, played, heroes, status] = await Promise.all([
    heroesService.ownMatchups(user.accountId32, filter, now),
    matchQueries.playedHeroes(user.accountId32),
    matchesService.heroMap(),
    matchQueries.importStatus(user.accountId32),
  ]);
  const sync = status.sync;

  const withFilter = (patch: Partial<MatchupsFilter>) => matchupsHref({ ...filter, ...patch });
  const heroOptions = played.map((p) => ({
    heroId: p.heroId,
    games: p.games,
    name: heroName(heroes.get(p.heroId), p.heroId),
  }));
  const heroHrefs: Record<string, string> = { all: withFilter({ hero: undefined }) };
  for (const o of heroOptions) heroHrefs[String(o.heroId)] = withFilter({ hero: o.heroId });
  const activeFilters = [
    filter.range !== "all",
    filter.mode !== "all",
    filter.hero !== undefined,
  ].filter(Boolean).length;
  const filtered = activeFilters > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/heroes"
        className="relative inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("heroes.own.back")}
      </Link>
      <PageHeader
        kicker={t("heroes.own.kicker")}
        title={t("heroes.own.title")}
        description={t("heroes.own.description")}
        actions={
          <SyncControl
            stale={MatchSyncService.isStale(sync, now)}
            backfillComplete={sync?.backfillComplete ?? false}
            backfillCooldownMs={BACKFILL_COOLDOWN_MS}
            recheckMs={SYNC_COOLDOWN_MS}
            awaitingHistory={status.totals.all === 0}
            lastSyncedLabel={sync?.lastSyncAt ? formatAgo(sync.lastSyncAt, now) : null}
          />
        }
      />

      <FilterSheet
        label={t("matches.filters.label")}
        activeCount={activeFilters}
        className="flex-wrap items-center gap-2"
      >
        <SegmentedLinks
          label={t("matches.filters.timeRange")}
          options={[
            { value: "all", label: t("matches.filters.allTime") },
            {
              value: "patch",
              label: view.latestPatch
                ? t("matches.filters.patch", { version: view.latestPatch })
                : t("matches.filters.currentPatch"),
            },
            { value: "90d", label: t("heroes.own.last90") },
            { value: "30d", label: t("matches.filters.last30") },
          ]}
          active={filter.range}
          href={(range) => withFilter({ range })}
        />
        <SegmentedLinks
          label={t("matches.filters.gameType")}
          options={[
            { value: "all", label: t("matches.filters.allGames") },
            { value: "ranked", label: t("matches.filters.rankedOnly") },
          ]}
          active={filter.mode}
          href={(mode) => withFilter({ mode })}
        />
        {heroOptions.length > 0 && (
          <HeroFilter options={heroOptions} value={filter.hero} hrefFor={heroHrefs} />
        )}
      </FilterSheet>

      <LineupProgressNote progress={view.progress} />
      <OwnMatchupsSections view={view} heroes={heroes} filtered={filtered} />
    </div>
  );
}
