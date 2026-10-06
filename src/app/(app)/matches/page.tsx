import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, SearchX } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { annotationsService } from "@/modules/annotations";
import { getDraftRecord } from "@/modules/drafts/composition";
import { DraftRecordCard } from "@/modules/drafts/ui/draft-record-card";
import { getCurrentUser } from "@/modules/identity";
import {
  matchListHref,
  parseMatchListFilter,
  type MatchListFilter,
} from "@/modules/matches/application/match-list-filter";
import { getHeroMap, getMatchQueries } from "@/modules/matches/composition";
import { MIN_SAMPLE } from "@/modules/matches/domain/match-summary";
import { formatPercent, plural } from "@/modules/matches/ui/format";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";

export const metadata: Metadata = { title: "Matches" };

const PAGE_SIZE = 25;

export default async function MatchesPage({ searchParams }: PageProps<"/matches">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const filter = parseMatchListFilter(await searchParams);
  const now = new Date();

  const queries = await getMatchQueries();
  const [tagged, tags] = await Promise.all([
    filter.tag
      ? annotationsService.matchIdsWithTag(user.id, filter.tag).catch(() => [])
      : undefined,
    annotationsService.tagCounts(user.id).catch(() => []),
  ]);
  const [page, played, heroes] = await Promise.all([
    queries.listMatches(user.accountId32, filter, now, PAGE_SIZE, tagged),
    queries.playedHeroes(user.accountId32),
    getHeroMap(),
  ]);

  // Changing any filter restarts pagination.
  const withFilter = (patch: Partial<MatchListFilter>) =>
    matchListHref({ ...filter, cursor: undefined, ...patch });
  const heroOptions = played.map((p) => ({
    heroId: p.heroId,
    games: p.games,
    name: heroName(heroes.get(p.heroId), p.heroId),
  }));
  const heroHrefs: Record<string, string> = { all: withFilter({ hero: undefined }) };
  for (const o of heroOptions) heroHrefs[String(o.heroId)] = withFilter({ hero: o.heroId });

  const { games, wins } = page.record;
  const rate = games === 0 ? null : wins / games;
  const resultLabel = filter.result === "win" ? "wins" : filter.result === "loss" ? "losses" : null;
  const isFiltered =
    filter.range !== "all" ||
    filter.mode !== "all" ||
    filter.queue !== "all" ||
    filter.result !== "all" ||
    filter.hero !== undefined ||
    filter.tag !== undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Match history"
        title="Matches"
        description="Every imported game, filterable by queue, result, hero and time. Select a match for the full scoreboard."
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <SegmentedLinks
          label="Time range"
          options={[
            { value: "all", label: "All time" },
            {
              value: "patch",
              label: page.latestPatch ? `Patch ${page.latestPatch}` : "Current patch",
            },
            { value: "30d", label: "30 days" },
          ]}
          active={filter.range}
          href={(range) => withFilter({ range })}
        />
        <SegmentedLinks
          label="Queue"
          options={[
            { value: "all", label: "Any queue" },
            { value: "solo", label: "Solo" },
            { value: "party", label: "Party" },
            { value: "unknown", label: "Unknown" },
          ]}
          active={filter.queue}
          href={(queue) => withFilter({ queue })}
        />
        <SegmentedLinks
          label="Result"
          options={[
            { value: "all", label: "Any result" },
            { value: "win", label: "Wins" },
            { value: "loss", label: "Losses" },
          ]}
          active={filter.result}
          href={(result) => withFilter({ result })}
        />
        <SegmentedLinks
          label="Game type"
          options={[
            { value: "all", label: "All games" },
            { value: "ranked", label: "Ranked" },
          ]}
          active={filter.mode}
          href={(mode) => withFilter({ mode })}
        />
        <HeroFilter options={heroOptions} value={filter.hero} hrefFor={heroHrefs} />
        {isFiltered && (
          <Link
            href="/matches"
            className="px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </Link>
        )}
      </div>

      {tags.length > 0 && (
        <nav aria-label="Your tags" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Your tags:</span>
          {tags.map((t) => {
            const active = filter.tag === t.tag;
            return (
              <Link
                key={t.tag}
                href={withFilter({ tag: active ? undefined : t.tag })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  active
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-white/10 text-muted-foreground hover:border-gold/40 hover:text-gold",
                )}
              >
                {t.tag} <span className="tabular-nums opacity-70">{t.matches}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <Suspense fallback={null}>
        <DraftRecordSection accountId32={user.accountId32} />
      </Suspense>

      <section
        className="panel grid grid-cols-1 gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center"
        aria-label="Filtered totals"
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <div>
            <div className="kicker">{resultLabel ? `Showing ${resultLabel}` : "Matches"}</div>
            <div className="text-2xl font-semibold sm:text-3xl">
              {page.matching.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="kicker">Record</div>
            <div className="text-2xl font-semibold whitespace-nowrap sm:text-3xl">
              <span className="text-win">{wins}</span>
              <span className="text-muted-foreground"> – </span>
              <span className="text-loss">{games - wins}</span>
            </div>
          </div>
          <div>
            <div className="kicker">Win rate</div>
            <div className="text-2xl font-semibold sm:text-3xl">{formatPercent(rate)}</div>
          </div>
        </div>
        <div className="space-y-1.5 sm:pl-6">
          <WinRateBar rate={rate} muted={games < MIN_SAMPLE} />
          <p className="text-xs text-muted-foreground">
            {resultLabel
              ? `The list shows only your ${resultLabel}. Record and win rate count both wins and losses under your other filters.`
              : games < MIN_SAMPLE && games > 0
                ? `Only ${plural(games, "game")} match, too few to judge a win rate.`
                : "These totals include every match that fits your filters, not just this page. The line marks 50%."}
          </p>
        </div>
      </section>

      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <SearchX aria-hidden className="size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No matches found</h2>
          <p className="text-sm text-muted-foreground">
            {isFiltered
              ? "Nothing matches these filters."
              : "No matches imported yet. Visit your overview to sync."}
          </p>
        </section>
      ) : (
        <section className="panel overflow-hidden" aria-label="Matches">
          <MatchRows matches={page.items} heroes={heroes} now={now} />
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm">
            {filter.cursor ? (
              <Link href={withFilter({})} className="text-muted-foreground hover:text-foreground">
                Back to newest
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">Newest first</span>
            )}
            {page.nextCursor && (
              <Link
                href={matchListHref({ ...filter, cursor: page.nextCursor })}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                Older matches <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

async function DraftRecordSection({ accountId32 }: { accountId32: number }) {
  const view = await getDraftRecord(accountId32).catch(() => null);
  if (!view || view.record.graded === 0) return null;
  return <DraftRecordCard view={view} />;
}
