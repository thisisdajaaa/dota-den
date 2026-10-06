import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { heroesService, type HeroesService } from "@/modules/heroes";
import { buildVsPros } from "@/modules/heroes/domain/build-vs-pros";
import type { HeroRecord } from "@/modules/heroes/domain/hero-stats";
import {
  HeroBanner,
  HighRankCard,
  ItemsCard,
  MatchupsCard,
  TrendCard,
  Unavailable,
  unavailableCopy,
} from "@/modules/heroes/ui/hero-sections";
import { BuildCard } from "@/modules/heroes/ui/build-card";
import { ProgressCard } from "@/modules/heroes/ui/progress-card";
import { guideService } from "@/modules/guides";
import { getViewerTimeZone } from "@/common/http/request-context";
import { getCurrentUser } from "@/modules/identity";
import type { HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import { matchesService, matchQueries } from "@/modules/matches";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { MetaSection, SectionSkeleton } from "@/modules/meta/ui/meta-section";
import { Skeleton } from "@/components/ui/skeleton";

const RECENT_ON_HERO = 10;

function parseHeroId(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 && id <= 1000 ? id : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/heroes/[heroId]">): Promise<Metadata> {
  const t = await getT();
  const heroId = parseHeroId((await params).heroId);
  if (heroId === null) return { title: t("heroes.detail.notFoundTitle") };
  const hero = (await matchesService.heroMap()).get(heroId);
  return { title: t("heroes.detail.title", { name: heroName(hero, heroId) }) };
}

/** Await a section's data; a thrown error becomes a failed result (logged), never a crash. */
async function settle<T>(
  p: Promise<T>,
  section: string,
): Promise<T | { ok: false; error: { type: "error" } }> {
  try {
    return await p;
  } catch (e) {
    logger.error("hero_section_failed", { section, error: e });
    return { ok: false, error: { type: "error" } };
  }
}

export default async function HeroPage({ params }: PageProps<"/heroes/[heroId]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const heroId = parseHeroId((await params).heroId);
  if (heroId === null) notFound();
  const t = await getT();

  const service = heroesService;
  const queries = matchQueries;
  const [heroes, { timeZone }] = await Promise.all([matchesService.heroMap(), getViewerTimeZone()]);
  const hero = heroes.get(heroId);
  const now = new Date();
  const { record, trend } = await service.overview(user.accountId32, heroId, timeZone);
  // Unknown to the catalog and never played: nothing to show. (If the catalog is down, a
  // hero you've played still gets its page.)
  if (!hero && (heroes.size > 0 || record.games === 0)) notFound();
  const name = heroName(hero, heroId);

  if (record.games === 0) {
    return (
      <div className="space-y-6">
        <BackLink />
        <HeroBanner hero={hero} heroId={heroId} games={0} />
        <section className="panel space-y-2 p-6 text-sm">
          <h2 className="text-lg font-semibold">{t("heroes.detail.noGamesTitle", { name })}</h2>
          <p className="text-muted-foreground">{t("heroes.detail.noGamesBody", { name })}</p>
        </section>
        <Suspense fallback={<SectionSkeleton label={t("heroes.detail.loadingPublic")} rows={1} />}>
          <HighRankSection service={service} heroId={heroId} record={record} name={name} />
        </Suspense>
      </div>
    );
  }

  // One upstream call feeds both the farm tile and the items card.
  const details = settle(service.details(user.accountId32, heroId), "details");
  const recent = await queries.listMatches(
    user.accountId32,
    { range: "all", mode: "all", queue: "all", result: "all", hero: heroId },
    now,
    RECENT_ON_HERO,
  );

  return (
    <div className="space-y-6">
      <BackLink />
      <HeroBanner hero={hero} heroId={heroId} games={record.games} />

      <section
        aria-label={t("heroes.detail.recordLabel")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile
          label={t("heroes.detail.winRate")}
          value={formatPercent(record.winRate)}
          meter={record.winRate}
          tone={
            record.lowSample
              ? "muted"
              : record.winRate !== null && record.winRate >= 0.5
                ? "win"
                : "loss"
          }
          detail={`${plural(t, "heroes.counts.wins", record.wins)} · ${plural(t, "heroes.counts.losses", record.losses)}${record.lowSample ? ` · ${t("heroes.tooFewToJudge")}` : ""}`}
        />
        <StatTile
          label={t("heroes.detail.games")}
          value={record.games.toLocaleString("en-US")}
          detail={
            record.lastPlayed
              ? t("heroes.detail.lastPlayed", { ago: formatAgo(record.lastPlayed, now) })
              : undefined
          }
        />
        <StatTile
          label={t("heroes.detail.kda")}
          value={record.kda !== null ? record.kda.toFixed(2) : "—"}
          detail={
            record.averages
              ? t("heroes.detail.averages", {
                  kills: record.averages.kills.toFixed(1),
                  deaths: record.averages.deaths.toFixed(1),
                  assists: record.averages.assists.toFixed(1),
                })
              : undefined
          }
        />
        <Suspense fallback={<Skeleton className="h-28 rounded-2xl" />}>
          <FarmTile details={details} />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <TrendCard trend={trend} heroLabel={name} />
          <Suspense
            fallback={<SectionSkeleton label={t("heroes.detail.loadingProgress")} rows={4} />}
          >
            <ProgressSection details={details} name={name} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label={t("heroes.detail.loadingItems")} rows={4} />}>
            <ItemsSection details={details} name={name} />
          </Suspense>
          <Suspense fallback={null}>
            <BuildSection details={details} heroId={heroId} name={name} />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense
            fallback={<SectionSkeleton label={t("heroes.detail.loadingPublic")} rows={1} />}
          >
            <HighRankSection service={service} heroId={heroId} record={record} name={name} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SectionSkeleton label={t("heroes.detail.loadingMatchups")} rows={5} />}>
        <MatchupsSection
          service={service}
          accountId32={user.accountId32}
          heroId={heroId}
          heroes={heroes}
          name={name}
        />
      </Suspense>

      <section className="panel overflow-hidden" aria-labelledby="hero-recent-matches">
        <div className="flex items-baseline justify-between p-5 pb-3">
          <div>
            <p className="kicker">{t("heroes.detail.matchHistory")}</p>
            <h2 id="hero-recent-matches" className="text-lg font-semibold">
              {t("heroes.detail.recentOn", { name })}
            </h2>
          </div>
          <Link href={`/matches?hero=${heroId}`} className="text-xs text-gold hover:underline">
            {t("heroes.detail.viewAll", {
              matches: plural(t, "heroes.counts.matches", recent.record.games),
            })}
          </Link>
        </div>
        <MatchRows matches={recent.items} heroes={heroes} now={now} />
      </section>
    </div>
  );
}

async function BackLink() {
  const t = await getT();
  return (
    <Link
      href="/heroes"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t("heroes.detail.back")}
    </Link>
  );
}

type DetailsResult = ReturnType<typeof settle<Awaited<ReturnType<HeroesService["details"]>>>>;

async function FarmTile({ details }: { details: DetailsResult }) {
  const [res, t] = await Promise.all([details, getT()]);
  if (!res.ok || !res.value.gpm)
    return (
      <StatTile
        label="GPM / XPM"
        value="—"
        detail={res.ok ? t("heroes.detail.noFarm") : t("heroes.detail.farmUnavailable")}
      />
    );
  const { gpm, xpm } = res.value;
  return (
    <StatTile
      label="GPM / XPM"
      value={`${Math.round(gpm.average)} / ${xpm ? Math.round(xpm.average) : "—"}`}
      detail={t("heroes.detail.farmDetail", {
        games: plural(t, "heroes.counts.games", gpm.games),
      })}
    />
  );
}

async function HighRankSection({
  service,
  heroId,
  record,
  name,
}: {
  service: HeroesService;
  heroId: number;
  record: HeroRecord;
  name: string;
}) {
  const res = await settle(service.highRank(heroId, record), "high_rank");
  if (!res.ok) {
    const t = await getT();
    return (
      <MetaSection
        id="hero-high-rank"
        kicker={t("heroes.highRank.kicker")}
        title={t("heroes.highRank.title")}
      >
        <Unavailable>
          {res.error.type === "not_found"
            ? t("heroes.highRank.none", { name })
            : unavailableCopy(res.error, "public hero stats", t)}
        </Unavailable>
      </MetaSection>
    );
  }
  return <HighRankCard comparison={res.value} heroLabel={name} yourGames={record.games} />;
}

async function ProgressSection({ details, name }: { details: DetailsResult; name: string }) {
  const res = await details;
  if (!res.ok || !res.value.progress) return null;
  return <ProgressCard progress={res.value.progress} heroLabel={name} />;
}

async function BuildSection({
  details,
  heroId,
  name,
}: {
  details: DetailsResult;
  heroId: number;
  name: string;
}) {
  const [res, items] = await Promise.all([
    details,
    matchesService.itemMap().catch((): Map<number, ItemInfo> => new Map()),
  ]);
  if (!res.ok || !res.value.items?.enough || items.size === 0) return null;
  const pro = await guideService
    .proCoreItems(heroId, (id) => items.get(id)?.qual === "consumable")
    .catch(() => null);
  if (!pro) return null;
  const rows = buildVsPros(pro, (id) => items.get(id)?.key, res.value.items.shares);
  if (rows.length === 0) return null;
  return (
    <BuildCard rows={rows} items={items} heroLabel={name} yourGames={res.value.items.withData} />
  );
}

async function ItemsSection({ details, name }: { details: DetailsResult; name: string }) {
  const [res, items] = await Promise.all([
    details,
    matchesService.itemMap().catch((): Map<number, ItemInfo> => new Map()),
  ]);
  if (!res.ok) {
    const t = await getT();
    return (
      <MetaSection
        id="hero-items"
        kicker={t("heroes.items.kicker")}
        title={t("heroes.items.title")}
      >
        <Unavailable>{unavailableCopy(res.error, "item data", t)}</Unavailable>
      </MetaSection>
    );
  }
  const byKey = new Map([...items.values()].map((i) => [i.key, i]));
  return <ItemsCard details={res.value} items={byKey} heroLabel={name} />;
}

async function MatchupsSection({
  service,
  accountId32,
  heroId,
  heroes,
  name,
}: {
  service: HeroesService;
  accountId32: number;
  heroId: number;
  heroes: Map<number, HeroInfo>;
  name: string;
}) {
  const res = await settle(service.matchups(accountId32, heroId), "matchups");
  if (!res.ok) {
    const t = await getT();
    return (
      <MetaSection
        id="hero-matchups"
        kicker={t("heroes.matchups.kicker")}
        title={t("heroes.matchups.title", { hero: name })}
      >
        <Unavailable>{unavailableCopy(res.error, "matchups", t)}</Unavailable>
      </MetaSection>
    );
  }
  return <MatchupsCard view={res.value} heroes={heroes} heroLabel={name} />;
}
