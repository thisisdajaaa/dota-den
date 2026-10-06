import Link from "next/link";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import type { DuosView, TopHeroesView } from "@/modules/meta/dtos/responses/meta.dto";
import type { LatestPatchResult, MetaSourceError as SourceError } from "@/modules/meta";
import type { Position } from "@/modules/meta/domain/position";
import { LaneDuosCard } from "@/modules/meta/ui/lane-duos-card";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import { PatchTipsCard } from "@/modules/meta/ui/patch-tips-card";
import { TopHeroesCard } from "@/modules/meta/ui/top-heroes-card";
import type { Result } from "@/common/result";

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

const unavailableCopy = (
  t: Translator<Messages>,
  error: SourceError | { type: "error" },
  what: "heroStats" | "proLaneData",
) =>
  error.type === "rate_limited"
    ? t(`meta.unavailable.${what}.busy`)
    : t(`meta.unavailable.${what}.down`);

export async function TopHeroesSection({
  heroes,
  catalog,
}: {
  heroes: Promise<Loaded<TopHeroesView>>;
  catalog: Promise<Map<number, HeroInfo>>;
}) {
  const [res, cat, t] = await Promise.all([heroes, catalog, getT()]);
  if (!res.ok)
    return (
      <MetaSection
        id="meta-top-heroes"
        kicker={t("meta.topHeroes.kicker")}
        title={t("meta.topHeroes.titleShort")}
      >
        <Unavailable>{unavailableCopy(t, res.error, "heroStats")}</Unavailable>
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
  const [res, latest, cat, t] = await Promise.all([heroes, patch, catalog, getT()]);
  if (!res.ok)
    return (
      <MetaSection
        id="meta-patch-tips"
        kicker={t("meta.tips.kickerShort")}
        title={t("meta.tips.title")}
      >
        <Unavailable>
          {t("meta.tips.needStats")}{" "}
          <Link href="/patches" className="text-gold hover:underline">
            {t("meta.tips.readNotes")}
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
  const [res, cat, t] = await Promise.all([duos, catalog, getT()]);
  if (!res.ok)
    return (
      <MetaSection id="meta-lane-duos" kicker={t("meta.duos.kicker")} title={t("meta.duos.title")}>
        <Unavailable>{unavailableCopy(t, res.error, "proLaneData")}</Unavailable>
      </MetaSection>
    );
  return <LaneDuosCard position={position} view={res.value} catalog={cat} now={new Date()} />;
}

export async function PatchLine({ patch }: { patch: Promise<LatestPatchResult> }) {
  const [latest, t] = await Promise.all([patch, getT()]);
  if (latest.status !== "ok")
    return (
      <p className="text-xs text-muted-foreground">
        {latest.status === "none" ? t("meta.patchLine.none") : t("meta.patchLine.unavailable")}
      </p>
    );
  const { version, publishedAt } = latest.patch;
  return (
    <p className="text-xs text-muted-foreground">
      {t("meta.patchLine.latest")}{" "}
      <Link
        href={`/patches/${encodeURIComponent(version)}`}
        className="font-medium text-gold hover:underline"
      >
        {version}
      </Link>
      {t("meta.patchLine.released", {
        date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
          publishedAt,
        ),
      })}
    </p>
  );
}
