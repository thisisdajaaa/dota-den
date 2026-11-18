import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, Compass } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { getCurrentUser } from "@/modules/identity";
import { playersService } from "@/modules/players";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { matchesService } from "@/modules/matches";
import type { RoleView } from "@/modules/meta/dtos/responses/meta.dto";
import { metaService, type MetaSourceError as SourceError } from "@/modules/meta";
import {
  MIN_ROLE_GAMES,
  parsePosition,
  POSITION_INFO,
  POSITIONS,
  type Position,
} from "@/modules/meta/domain/position";
import {
  bracketLabel,
  chooseBracket,
  DEFAULT_BRACKET,
  parseBracket,
  type MetaBracket,
} from "@/modules/meta/domain/rank-bracket";
import { BracketPicker } from "@/modules/meta/ui/bracket-picker";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";
import { RolePicker, RoleTabs } from "@/modules/meta/ui/role-picker";
import type { Result } from "@/common/result";
import {
  ContestedSection,
  LaneDuosSection,
  OverviewFootnote,
  OverviewSection,
  PatchLine,
  PatchTipsSection,
  settle,
  TopHeroesSection,
} from "./sections";

export async function generateMetadata({ searchParams }: PageProps<"/meta">): Promise<Metadata> {
  const [t, params] = await Promise.all([getT(), searchParams]);
  const bracket = parseBracket(params.bracket);
  // ?pos= and ?bracket= views are the same page filtered: one canonical URL for all of them.
  return {
    title:
      bracket && bracket !== DEFAULT_BRACKET
        ? t("meta.titleBracket", { bracket: bracketLabel(bracket) })
        : t("meta.title"),
    alternates: { canonical: "/meta" },
  };
}

/** The viewer's rank medal (OpenDota rank tier), or null when unknown. Never throws. */
async function viewerRankTier(accountId32: number): Promise<number | null> {
  try {
    return (await playersService.quickProfile(accountId32)).profile?.rankTier ?? null;
  } catch (e) {
    logger.warn("meta_rank_tier_failed", { error: e });
    return null;
  }
}

export default async function MetaPage({ searchParams }: PageProps<"/meta">) {
  const params = await searchParams;
  const picked = parsePosition(params.pos);
  const t = await getT();

  const service = metaService;
  const user = await getCurrentUser({ tolerateErrors: true });
  // The bracket in the link, else the signed-in viewer's own (from their rank medal), else
  // the default Ancient–Immortal view. Links keep the bracket only when it was picked.
  const choice = chooseBracket(
    params.bracket,
    user ? await viewerRankTier(user.accountId32) : null,
  );
  const bracket = choice.bracket;
  const linkBracket = choice.reason === "url" ? bracket : null;
  // Your role needs your recent matches from OpenDota, which can be slow: start it now and
  // wait for it only inside the boundaries that show it.
  const role = user ? settle(service.userRole(user.accountId32), "role") : null;

  const patch = metaService.latestPatch();
  const catalog = matchesService.heroMap().catch((e: unknown): Map<number, HeroInfo> => {
    logger.warn("meta_hero_catalog_failed", { error: e });
    return new Map();
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("meta.page.kicker")}
        title={t("meta.page.title")}
        description={
          bracket === DEFAULT_BRACKET
            ? t("meta.page.description")
            : t("meta.page.descriptionBracket", { bracket: bracketLabel(bracket) })
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/guides">
              <BookOpen aria-hidden className="size-4" /> {t("meta.page.guides")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-4 w-72" />}>
        <PatchLine patch={patch} />
      </Suspense>

      <BracketPicker choice={choice} position={picked} />

      {role && (
        <Suspense fallback={<Skeleton className="h-24 rounded-2xl" />}>
          <YourRole role={role} t={t} />
        </Suspense>
      )}

      {picked !== null ? (
        <RoleSections
          key={`${picked}:${bracket}`}
          position={picked}
          role={role}
          service={service}
          patch={patch}
          catalog={catalog}
          bracket={bracket}
          linkBracket={linkBracket}
          t={t}
        />
      ) : role ? (
        <Suspense fallback={<RoleSectionsSkeleton t={t} />}>
          <YourRoleSections
            role={role}
            service={service}
            patch={patch}
            catalog={catalog}
            bracket={bracket}
            linkBracket={linkBracket}
            t={t}
          />
        </Suspense>
      ) : (
        <PickRole
          t={t}
          service={service}
          catalog={catalog}
          bracket={bracket}
          linkBracket={linkBracket}
        />
      )}
    </div>
  );
}

type RoleResult = Result<RoleView, SourceError | { type: "error" }>;

/** No position yet: the role picker, with the best heroes per role group below it. */
function PickRole({
  t,
  service,
  catalog,
  bracket,
  linkBracket,
}: {
  t: Translator<Messages>;
  service: typeof metaService;
  catalog: Promise<Map<number, HeroInfo>>;
  bracket: MetaBracket;
  linkBracket: MetaBracket | null;
}) {
  return (
    <>
      <section aria-labelledby="pick-role" className="space-y-3">
        <h2 id="pick-role" className="text-lg font-semibold">
          {t("meta.page.pickRole")}
        </h2>
        <RolePicker bracket={linkBracket} />
      </section>
      <Overview
        service={service}
        catalog={catalog}
        bracket={bracket}
        linkBracket={linkBracket}
        t={t}
      />
    </>
  );
}

function RoleSectionsSkeleton({ t }: { t: Translator<Messages> }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <SectionSkeleton label={t("meta.page.loadingTopHeroes")} rows={6} />
      </div>
      <div className="lg:col-span-2">
        <SectionSkeleton label={t("meta.page.loadingDuos")} rows={4} />
      </div>
    </div>
  );
}

/** No position picked: show the user's own once it's known, else the role picker. */
async function YourRoleSections({
  role,
  ...rest
}: Omit<React.ComponentProps<typeof RoleSections>, "position" | "role"> & {
  role: Promise<RoleResult>;
}) {
  const res = await role;
  const yours = res.ok ? res.value.derivation.position : null;
  if (yours === null)
    return (
      <PickRole
        t={rest.t}
        service={rest.service}
        catalog={rest.catalog}
        bracket={rest.bracket}
        linkBracket={rest.linkBracket}
      />
    );
  return <RoleSections key={yours} position={yours} role={role} {...rest} />;
}

/** The position tabs, with the user's own position marked once it's known. */
async function PositionTabs({
  active,
  role,
  bracket,
}: {
  active: Position;
  role: Promise<RoleResult> | null;
  bracket: MetaBracket | null;
}) {
  const res = await role;
  return (
    <RoleTabs
      active={active}
      yours={res?.ok ? res.value.derivation.position : null}
      bracket={bracket}
    />
  );
}

function RoleSections({
  position,
  role,
  service,
  patch,
  catalog,
  bracket,
  linkBracket,
  t,
}: {
  position: Position;
  role: Promise<RoleResult> | null;
  service: typeof metaService;
  patch: ReturnType<typeof metaService.latestPatch>;
  catalog: Promise<Map<number, HeroInfo>>;
  bracket: MetaBracket;
  /** The bracket picked in the URL, kept in the position links. */
  linkBracket: MetaBracket | null;
  t: Translator<Messages>;
}) {
  // Started once and shared: the tips section reuses the hero ranking.
  const heroes = settle(service.topHeroes(position, bracket), "top_heroes");
  const duos = settle(service.laneDuos(position), "lane_duos");
  return (
    <>
      <Suspense fallback={<RoleTabs active={position} yours={null} bracket={linkBracket} />}>
        <PositionTabs active={position} role={role} bracket={linkBracket} />
      </Suspense>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Suspense fallback={<SectionSkeleton label={t("meta.page.loadingTopHeroes")} rows={6} />}>
            <TopHeroesSection heroes={heroes} catalog={catalog} />
          </Suspense>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<SectionSkeleton label={t("meta.page.loadingTips")} rows={3} />}>
            <PatchTipsSection position={position} heroes={heroes} patch={patch} catalog={catalog} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label={t("meta.page.loadingDuos")} rows={4} />}>
            <LaneDuosSection position={position} duos={duos} catalog={catalog} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/** Real content before a role is picked: the best heroes per role group, from cached stats. */
function Overview({
  service,
  catalog,
  bracket,
  linkBracket,
  t,
}: {
  service: typeof metaService;
  catalog: Promise<Map<number, HeroInfo>>;
  bracket: MetaBracket;
  linkBracket: MetaBracket | null;
  t: Translator<Messages>;
}) {
  const overview = settle(service.overview(undefined, bracket), "overview");
  const inBracket = bracket !== DEFAULT_BRACKET;
  const contested = settle(service.contested(), "contested");
  return (
    <section aria-labelledby="meta-overview" className="space-y-4">
      <div className="space-y-1">
        <p className="kicker">{t("meta.overview.kicker")}</p>
        <h2 id="meta-overview" className="text-lg font-semibold">
          {inBracket
            ? t("meta.overview.titleBracket", { bracket: bracketLabel(bracket) })
            : t("meta.overview.title")}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {inBracket
            ? t("meta.overview.descriptionBracket", { bracket: bracketLabel(bracket) })
            : t("meta.overview.description")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<OverviewSkeleton label={t("meta.overview.loading")} count={3} />}>
          <OverviewSection overview={overview} catalog={catalog} linkBracket={linkBracket} />
        </Suspense>
        <Suspense fallback={<OverviewSkeleton label={t("meta.overview.loading")} count={1} />}>
          <ContestedSection contested={contested} catalog={catalog} />
        </Suspense>
      </div>
      <Suspense fallback={<Skeleton className="h-4 w-full max-w-2xl" />}>
        <OverviewFootnote overview={overview} />
      </Suspense>
    </section>
  );
}

function OverviewSkeleton({ label, count }: { label: string; count: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="panel space-y-4 p-5" aria-busy aria-label={label}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-5 w-28" />
      </div>
      {Array.from({ length: 3 }, (_, j) => (
        <div key={j} className="flex items-center gap-3">
          <Skeleton className="h-8 w-[3.56rem] rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-28 max-w-full" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
      <Skeleton className="h-3 w-40" />
    </div>
  ));
}

async function YourRole({
  role: pending,
  t,
}: {
  role: Promise<RoleResult>;
  t: Translator<Messages>;
}) {
  const role = await pending;
  const games = (n: number) => plural(t, "meta.counts.games", n);
  let body: React.ReactNode;
  if (!role.ok) {
    body = <p className="text-sm text-muted-foreground">{t("meta.yourRole.unavailable")}</p>;
  } else {
    const { derivation: d, windowDays } = role.value;
    if (d.position === null) {
      body = (
        <p className="text-sm text-muted-foreground">
          {t(d.counted === 1 ? "meta.yourRole.tooFewOne" : "meta.yourRole.tooFewOther", {
            games: games(d.counted),
            days: windowDays,
            min: MIN_ROLE_GAMES,
          })}
        </p>
      );
    } else {
      const info = POSITION_INFO[d.position];
      body = (
        <>
          <p className="text-lg font-semibold">
            {info.short} · {info.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("meta.yourRole.basedOn", { games: games(d.counted), days: windowDays })}
            {d.skipped > 0 && ` ${plural(t, "meta.counts.otherGames", d.skipped)}`}
          </p>
          <ul aria-label={t("meta.yourRole.byPosition")} className="flex flex-wrap gap-1.5 pt-1">
            {POSITIONS.filter((p) => d.byPosition[p] > 0).map((p) => (
              <li
                key={p}
                className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-xs text-muted-foreground"
              >
                {t("meta.yourRole.positionGames", {
                  pos: POSITION_INFO[p].short,
                  games: games(d.byPosition[p]),
                })}
              </li>
            ))}
          </ul>
        </>
      );
    }
  }
  return (
    <section aria-labelledby="your-role" className="panel flex items-start gap-4 p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Compass aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <h2 id="your-role" className="kicker">
          {t("meta.yourRole.title")}
        </h2>
        {body}
      </div>
    </section>
  );
}
