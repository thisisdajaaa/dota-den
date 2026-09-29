import type { Metadata } from "next";
import { Suspense } from "react";
import { Compass } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/modules/identity/composition";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { getHeroMap } from "@/modules/matches/composition";
import { plural } from "@/modules/matches/ui/format";
import type { RoleView } from "@/modules/meta/application/meta-service";
import type { SourceError } from "@/modules/meta/application/ports";
import { getLatestPatchForMeta, getMetaService } from "@/modules/meta/composition";
import {
  MIN_ROLE_GAMES,
  parsePosition,
  POSITION_INFO,
  POSITIONS,
  type Position,
} from "@/modules/meta/domain/position";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";
import { RolePicker, RoleTabs } from "@/modules/meta/ui/role-picker";
import type { Result } from "@/modules/shared/domain/result";
import { LaneDuosSection, PatchLine, PatchTipsSection, settle, TopHeroesSection } from "./sections";

export const metadata: Metadata = { title: "Meta" };

export default async function MetaPage({ searchParams }: PageProps<"/meta">) {
  const params = await searchParams;
  const picked = parsePosition(params.pos);

  const [user, service] = await Promise.all([
    getCurrentUser({ tolerateErrors: true }),
    getMetaService(),
  ]);
  const role = user ? await settle(service.userRole(user.accountId32), "role") : null;
  const yours = role?.ok ? role.value.derivation.position : null;
  const position = picked ?? yours;

  const patch = getLatestPatchForMeta();
  const catalog = getHeroMap().catch((e: unknown): Map<number, HeroInfo> => {
    logger.warn("meta_hero_catalog_failed", { error: e });
    return new Map();
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Meta"
        title="What's strong right now"
        description="The heroes and lane partners doing best for each role in recent high-rank games and tournaments, with this patch's changes."
      />
      <Suspense fallback={<Skeleton className="h-4 w-72" />}>
        <PatchLine patch={patch} />
      </Suspense>

      {user && <YourRole role={role} />}

      {position === null ? (
        <section aria-labelledby="pick-role" className="space-y-3">
          <h2 id="pick-role" className="text-lg font-semibold">
            Which role do you play?
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
}: {
  position: Position;
  yours: Position | null;
  service: Awaited<ReturnType<typeof getMetaService>>;
  patch: ReturnType<typeof getLatestPatchForMeta>;
  catalog: Promise<Map<number, HeroInfo>>;
}) {
  // Started once and shared: the tips section reuses the hero ranking.
  const heroes = settle(service.topHeroes(position), "top_heroes");
  const duos = settle(service.laneDuos(position), "lane_duos");
  return (
    <>
      <RoleTabs active={position} yours={yours} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Suspense fallback={<SectionSkeleton label="Loading top heroes" rows={6} />}>
            <TopHeroesSection heroes={heroes} catalog={catalog} />
          </Suspense>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <Suspense fallback={<SectionSkeleton label="Loading patch tips" rows={3} />}>
            <PatchTipsSection position={position} heroes={heroes} patch={patch} catalog={catalog} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton label="Loading lane duos" rows={4} />}>
            <LaneDuosSection position={position} duos={duos} catalog={catalog} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function YourRole({ role }: { role: Result<RoleView, SourceError | { type: "error" }> | null }) {
  if (!role) return null;
  let body: React.ReactNode;
  if (!role.ok) {
    body = (
      <p className="text-sm text-muted-foreground">
        Your recent lanes are unavailable right now, so we can&apos;t tell your role. Pick one
        below.
      </p>
    );
  } else {
    const { derivation: d, windowDays } = role.value;
    if (d.position === null) {
      body = (
        <p className="text-sm text-muted-foreground">
          We can&apos;t tell your role yet: {plural(d.counted, "game")} from the last {windowDays}{" "}
          days {d.counted === 1 ? "has" : "have"} lane data, and we need at least {MIN_ROLE_GAMES}.
          Lane data only exists for games OpenDota has parsed. Pick a role below.
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
            Based on your last {plural(d.counted, "game")} with lane data (past {windowDays} days).
            {d.skipped > 0 &&
              ` ${plural(d.skipped, "other game")} had no lane data and ${d.skipped === 1 ? "isn't" : "aren't"} counted.`}
          </p>
          <ul aria-label="Games by position" className="flex flex-wrap gap-1.5 pt-1">
            {POSITIONS.filter((p) => d.byPosition[p] > 0).map((p) => (
              <li
                key={p}
                className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-xs text-muted-foreground"
              >
                {POSITION_INFO[p].short}: {plural(d.byPosition[p], "game")}
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
          Your role
        </h2>
        {body}
      </div>
    </section>
  );
}
