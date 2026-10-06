import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { logger } from "@/common/logging/logger";
import { heroesService, type HeroesService } from "@/modules/heroes";
import { buildVsPros } from "@/modules/heroes/domain/build-vs-pros";
import type { HeroRecord } from "@/modules/heroes/domain/hero-stats";
import {
  HeroBanner,
  HighRankCard,
  ItemsCard,
  MatchupsCard,
  countOf,
  TrendCard,
  Unavailable,
  unavailableCopy,
} from "@/modules/heroes/ui/hero-sections";
import { BuildCard } from "@/modules/heroes/ui/build-card";
import { ProgressCard } from "@/modules/heroes/ui/progress-card";
import { guideService } from "@/modules/guides";
import { getViewerTimeZone } from "@/common/http/request-context";
import { getCurrentUser } from "@/modules/identity";
import type { HeroInfo, ItemInfo } from "@/modules/matches/application/ports";
import { getHeroMap, getItemMap, getMatchQueries } from "@/modules/matches/composition";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
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
  const heroId = parseHeroId((await params).heroId);
  if (heroId === null) return { title: "Hero not found" };
  const hero = (await getHeroMap()).get(heroId);
  return { title: `You on ${heroName(hero, heroId)}` };
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

  const service = heroesService;
  const [heroes, queries, { timeZone }] = await Promise.all([
    getHeroMap(),
    getMatchQueries(),
    getViewerTimeZone(),
  ]);
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
          <h2 className="text-lg font-semibold">No games on {name} yet</h2>
          <p className="text-muted-foreground">
            None of your imported matches are on {name}. Play a few and they&apos;ll show up here.
          </p>
        </section>
        <Suspense fallback={<SectionSkeleton label="Loading public win rate" rows={1} />}>
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

      <section aria-label="Your record" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Win rate"
          value={formatPercent(record.winRate)}
          meter={record.winRate}
          tone={
            record.lowSample
              ? "muted"
              : record.winRate !== null && record.winRate >= 0.5
                ? "win"
                : "loss"
          }
          detail={`${plural(record.wins, "win")} · ${plural(record.losses, "loss")}${record.lowSample ? " · too few to judge" : ""}`}
        />
        <StatTile
          label="Games"
          value={record.games.toLocaleString("en-US")}
          detail={
            record.lastPlayed ? `Last played ${formatAgo(record.lastPlayed, now)}` : undefined
          }
        />
        <StatTile
          label="KDA ratio"
          value={record.kda !== null ? record.kda.toFixed(2) : "—"}
          detail={
            record.averages
              ? `Avg ${record.averages.kills.toFixed(1)} kills · ${record.averages.deaths.toFixed(1)} deaths · ${record.averages.assists.toFixed(1)} assists`
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
          <Suspense fallback={<SectionSkeleton label="Loading your progress" rows={4} />}>
            <ProgressSection details={details} name={name} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label="Loading items" rows={4} />}>
            <ItemsSection details={details} name={name} />
          </Suspense>
          <Suspense fallback={null}>
            <BuildSection details={details} heroId={heroId} name={name} />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<SectionSkeleton label="Loading public win rate" rows={1} />}>
            <HighRankSection service={service} heroId={heroId} record={record} name={name} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SectionSkeleton label="Loading matchups" rows={5} />}>
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
            <p className="kicker">Match history</p>
            <h2 id="hero-recent-matches" className="text-lg font-semibold">
              Recent matches on {name}
            </h2>
          </div>
          <Link href={`/matches?hero=${heroId}`} className="text-xs text-gold hover:underline">
            View all {countOf(recent.record.games, "match", "matches")}
          </Link>
        </div>
        <MatchRows matches={recent.items} heroes={heroes} now={now} />
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/heroes"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      All heroes
    </Link>
  );
}

type DetailsResult = ReturnType<typeof settle<Awaited<ReturnType<HeroesService["details"]>>>>;

async function FarmTile({ details }: { details: DetailsResult }) {
  const res = await details;
  if (!res.ok || !res.value.gpm)
    return (
      <StatTile
        label="GPM / XPM"
        value="—"
        detail={res.ok ? "No farm data for this hero yet" : "Unavailable right now"}
      />
    );
  const { gpm, xpm } = res.value;
  return (
    <StatTile
      label="GPM / XPM"
      value={`${Math.round(gpm.average)} / ${xpm ? Math.round(xpm.average) : "—"}`}
      detail={`Average over your last ${plural(gpm.games, "game")} on this hero`}
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
  if (!res.ok)
    return (
      <MetaSection id="hero-high-rank" kicker="Public games" title="High-rank win rate">
        <Unavailable>
          {res.error.type === "not_found"
            ? `No public high-rank games on ${name} to compare with.`
            : unavailableCopy(res.error, "public hero stats")}
        </Unavailable>
      </MetaSection>
    );
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
    getItemMap().catch((): Map<number, ItemInfo> => new Map()),
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
    getItemMap().catch((): Map<number, ItemInfo> => new Map()),
  ]);
  if (!res.ok)
    return (
      <MetaSection id="hero-items" kicker="Items" title="Your most-bought items">
        <Unavailable>{unavailableCopy(res.error, "item data")}</Unavailable>
      </MetaSection>
    );
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
  if (!res.ok)
    return (
      <MetaSection
        id="hero-matchups"
        kicker="Matchups"
        title={`Who you beat and lose to on ${name}`}
      >
        <Unavailable>{unavailableCopy(res.error, "matchups")}</Unavailable>
      </MetaSection>
    );
  return <MatchupsCard view={res.value} heroes={heroes} heroLabel={name} />;
}
