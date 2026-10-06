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
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";
import { RolePicker, RoleTabs } from "@/modules/meta/ui/role-picker";
import type { Result } from "@/common/result";
import { LaneDuosSection, PatchLine, PatchTipsSection, settle, TopHeroesSection } from "./sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("meta.title") };
}

export default async function MetaPage({ searchParams }: PageProps<"/meta">) {
  const params = await searchParams;
  const picked = parsePosition(params.pos);
  const t = await getT();

  const service = metaService;
  const user = await getCurrentUser({ tolerateErrors: true });
  const role = user ? await settle(service.userRole(user.accountId32), "role") : null;
  const yours = role?.ok ? role.value.derivation.position : null;
  const position = picked ?? yours;

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
        description={t("meta.page.description")}
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

      {user && <YourRole role={role} t={t} />}

      {position === null ? (
        <section aria-labelledby="pick-role" className="space-y-3">
          <h2 id="pick-role" className="text-lg font-semibold">
            {t("meta.page.pickRole")}
          </h2>
          <RolePicker />
        </section>
      ) : (
        <RoleSections
          key={position}
          position={position}
          yours={yours}
          service={service}
          patch={patch}
          catalog={catalog}
          t={t}
        />
      )}
    </div>
  );
}

function RoleSections({
  position,
  yours,
  service,
  patch,
  catalog,
  t,
}: {
  position: Position;
  yours: Position | null;
  service: typeof metaService;
  patch: ReturnType<typeof metaService.latestPatch>;
  catalog: Promise<Map<number, HeroInfo>>;
  t: Translator<Messages>;
}) {
  // Started once and shared: the tips section reuses the hero ranking.
  const heroes = settle(service.topHeroes(position), "top_heroes");
  const duos = settle(service.laneDuos(position), "lane_duos");
  return (
    <>
      <RoleTabs active={position} yours={yours} />
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

function YourRole({
  role,
  t,
}: {
  role: Result<RoleView, SourceError | { type: "error" }> | null;
  t: Translator<Messages>;
}) {
  if (!role) return null;
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
