import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, SearchX } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { annotationsService } from "@/modules/annotations";
import { draftRecordService } from "@/modules/drafts";
import { DraftRecordCard } from "@/modules/drafts/ui/draft-record-card";
import { getCurrentUser } from "@/modules/identity";
import {
  matchListHref,
  parseMatchListFilter,
  type MatchListFilter,
} from "@/modules/matches/schemas/match-list-filter.schema";
import { matchQueries, matchesService } from "@/modules/matches";
import { MIN_SAMPLE } from "@/modules/matches/domain/match-summary";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroFilter } from "@/modules/matches/ui/hero-filter";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("matches.list.title") };
}

const PAGE_SIZE = 25;

export default async function MatchesPage({ searchParams }: PageProps<"/matches">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const filter = parseMatchListFilter(await searchParams);
  const t = await getT();
  const now = new Date();

  const queries = matchQueries;
  const [tagged, tags] = await Promise.all([
    filter.tag
      ? annotationsService.matchIdsWithTag(user.id, filter.tag).catch(() => [])
      : undefined,
    annotationsService.tagCounts(user.id).catch(() => []),
  ]);
  const [page, played, heroes] = await Promise.all([
    queries.listMatches(user.accountId32, filter, now, PAGE_SIZE, tagged),
    queries.playedHeroes(user.accountId32),
    matchesService.heroMap(),
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
  const resultLabel = filter.result === "win" || filter.result === "loss" ? filter.result : null;
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
        kicker={t("matches.list.kicker")}
        title={t("matches.list.title")}
        description={t("matches.list.description")}
      />

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("matches.filters.label")}
      >
        <SegmentedLinks
          label={t("matches.filters.timeRange")}
          options={[
            { value: "all", label: t("matches.filters.allTime") },
            {
              value: "patch",
              label: page.latestPatch
                ? t("matches.filters.patch", { version: page.latestPatch })
                : t("matches.filters.currentPatch"),
            },
            { value: "30d", label: t("matches.filters.days30") },
          ]}
          active={filter.range}
          href={(range) => withFilter({ range })}
        />
        <SegmentedLinks
          label={t("matches.filters.queue")}
          options={[
            { value: "all", label: t("matches.filters.anyQueue") },
            { value: "solo", label: t("matches.queue.solo") },
            { value: "party", label: t("matches.queue.party") },
            { value: "unknown", label: t("matches.queue.unknown") },
          ]}
          active={filter.queue}
          href={(queue) => withFilter({ queue })}
        />
        <SegmentedLinks
          label={t("matches.filters.result")}
          options={[
            { value: "all", label: t("matches.filters.anyResult") },
            { value: "win", label: t("matches.filters.wins") },
            { value: "loss", label: t("matches.filters.losses") },
          ]}
          active={filter.result}
          href={(result) => withFilter({ result })}
        />
        <SegmentedLinks
          label={t("matches.filters.gameType")}
          options={[
            { value: "all", label: t("matches.filters.allGames") },
            { value: "ranked", label: t("matches.filters.ranked") },
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
            {t("matches.filters.clear")}
          </Link>
        )}
      </div>

      {tags.length > 0 && (
        <nav
          aria-label={t("matches.list.yourTags")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-xs text-muted-foreground">
            {t("matches.list.yourTagsPrefix")}
          </span>
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
        aria-label={t("matches.list.totalsLabel")}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <div>
            <div className="kicker">
              {resultLabel === "win"
                ? t("matches.list.showingWins")
                : resultLabel === "loss"
                  ? t("matches.list.showingLosses")
                  : t("matches.list.matches")}
            </div>
            <div className="text-2xl font-semibold sm:text-3xl">
              {page.matching.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="kicker">{t("matches.list.record")}</div>
            <div className="text-2xl font-semibold whitespace-nowrap sm:text-3xl">
              <span className="text-win">{wins}</span>
              <span className="text-muted-foreground"> – </span>
              <span className="text-loss">{games - wins}</span>
            </div>
          </div>
          <div>
            <div className="kicker">{t("matches.list.winRate")}</div>
            <div className="text-2xl font-semibold sm:text-3xl">{formatPercent(rate)}</div>
          </div>
        </div>
        <div className="space-y-1.5 sm:pl-6">
          <WinRateBar rate={rate} muted={games < MIN_SAMPLE} />
          <p className="text-xs text-muted-foreground">
            {resultLabel === "win"
              ? t("matches.list.onlyWins")
              : resultLabel === "loss"
                ? t("matches.list.onlyLosses")
                : games < MIN_SAMPLE && games > 0
                  ? t("matches.list.fewGames", {
                      games: plural(t, "matches.list.games", games),
                    })
                  : t("matches.list.totalsNote")}
          </p>
        </div>
      </section>

      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <SearchX aria-hidden className="size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t("matches.list.noMatches")}</h2>
          <p className="text-sm text-muted-foreground">
            {isFiltered ? t("matches.list.noneFiltered") : t("matches.list.noneImported")}
          </p>
        </section>
      ) : (
        <section className="panel overflow-hidden" aria-label={t("matches.list.matches")}>
          <MatchRows matches={page.items} heroes={heroes} now={now} />
          <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm">
            {filter.cursor ? (
              <Link href={withFilter({})} className="text-muted-foreground hover:text-foreground">
                {t("matches.list.backToNewest")}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">{t("matches.list.newestFirst")}</span>
            )}
            {page.nextCursor && (
              <Link
                href={matchListHref({ ...filter, cursor: page.nextCursor })}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                {t("matches.list.older")} <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

async function DraftRecordSection({ accountId32 }: { accountId32: number }) {
  const view = await draftRecordService.forPlayer(accountId32).catch(() => null);
  if (!view || view.record.graded === 0) return null;
  return <DraftRecordCard view={view} />;
}
