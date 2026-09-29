import Link from "next/link";
import { logger } from "@/lib/logger";
import type { HeroInfo } from "@/modules/matches/application/ports";
import type { DuosView, TopHeroesView } from "@/modules/meta/application/meta-service";
import type { SourceError } from "@/modules/meta/application/ports";
import type { LatestPatchResult } from "@/modules/meta/composition";
import type { Position } from "@/modules/meta/domain/position";
import { LaneDuosCard } from "@/modules/meta/ui/lane-duos-card";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import { PatchTipsCard } from "@/modules/meta/ui/patch-tips-card";
import { TopHeroesCard } from "@/modules/meta/ui/top-heroes-card";
import type { Result } from "@/modules/shared/domain/result";

type Loaded<T> = Result<T, SourceError | { type: "error" }>;

/** Await a section's data; a thrown error becomes a failed result (logged), never a crash. */
export async function settle<T>(
  p: Promise<Result<T, SourceError>>,
  section: string,
): Promise<Loaded<T>> {
  try {
    const res = await p;
    if (!res.ok) logger.warn("meta_section_unavailable", { section, reason: res.error.type });
    return res;
  } catch (e) {
    logger.error("meta_section_failed", { section, error: e });
    return { ok: false, error: { type: "error" } };
  }
}

const unavailableCopy = (error: SourceError | { type: "error" }, what: string) =>
  error.type === "rate_limited"
    ? `OpenDota is getting a lot of requests right now, so ${what} can't be loaded. Try again in a minute.`
    : `${what.replace(/^./, (c) => c.toUpperCase())} ${what.endsWith("s") ? "are" : "is"} unavailable right now. Try again shortly.`;

export async function TopHeroesSection({
  heroes,
  catalog,
}: {
  heroes: Promise<Loaded<TopHeroesView>>;
  catalog: Promise<Map<number, HeroInfo>>;
}) {
  const [res, cat] = await Promise.all([heroes, catalog]);
  if (!res.ok)
    return (
      <MetaSection id="meta-top-heroes" kicker="Right now" title="Top heroes">
        <Unavailable>{unavailableCopy(res.error, "hero stats")}</Unavailable>
      </MetaSection>
    );
  return <TopHeroesCard view={res.value} catalog={cat} now={new Date()} />;
}

export async function PatchTipsSection({
  position,
  heroes,
  patch,
  catalog,
}: {
  position: Position;
  heroes: Promise<Loaded<TopHeroesView>>;
  patch: Promise<LatestPatchResult>;
  catalog: Promise<Map<number, HeroInfo>>;
}) {
  const [res, latest, cat] = await Promise.all([heroes, patch, catalog]);
  if (!res.ok)
    return (
      <MetaSection id="meta-patch-tips" kicker="Patch" title="Patch tips">
        <Unavailable>
          Patch tips need the hero stats, which are unavailable right now. You can still{" "}
          <Link href="/patches" className="text-gold hover:underline">
            read the patch notes
          </Link>
          .
        </Unavailable>
      </MetaSection>
    );
  return (
    <PatchTipsCard
      position={position}
      heroes={res.value.heroes}
      patch={latest.status === "ok" ? latest.patch : null}
      patchStatus={latest.status}
      catalog={cat}
    />
  );
}

export async function LaneDuosSection({
  position,
  duos,
  catalog,
}: {
  position: Position;
  duos: Promise<Loaded<DuosView>>;
  catalog: Promise<Map<number, HeroInfo>>;
}) {
  const [res, cat] = await Promise.all([duos, catalog]);
  if (!res.ok)
    return (
      <MetaSection id="meta-lane-duos" kicker="Lane partners" title="Strongest lane duos">
        <Unavailable>{unavailableCopy(res.error, "pro lane data")}</Unavailable>
      </MetaSection>
    );
  return <LaneDuosCard position={position} view={res.value} catalog={cat} now={new Date()} />;
}

export async function PatchLine({ patch }: { patch: Promise<LatestPatchResult> }) {
  const latest = await patch;
  if (latest.status !== "ok")
    return (
      <p className="text-xs text-muted-foreground">
        {latest.status === "none"
          ? "No patch notes imported yet."
          : "Patch info is unavailable right now."}
      </p>
    );
  const { version, publishedAt } = latest.patch;
  return (
    <p className="text-xs text-muted-foreground">
      Latest patch:{" "}
      <Link
        href={`/patches/${encodeURIComponent(version)}`}
        className="font-medium text-gold hover:underline"
      >
        {version}
      </Link>
      , released{" "}
      {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
        publishedAt,
      )}
      . Public stats cover recent games and may include some from before it.
    </p>
  );
}
