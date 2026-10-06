import Link from "next/link";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import { matchesService } from "@/modules/matches";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";
import { kdaOf, type PatchDigest, type Record } from "@/modules/patches/domain/digest";
import { patchesService } from "@/modules/patches";

export async function PatchDigestSkeleton() {
  const t = await getT();
  return <SectionSkeleton label={t("dashboard.patch.loading")} rows={3} />;
}

/** Heroes shown on the overview; the rest are one click away. */
const SHOWN = 6;

const rate = (r: Record) => (r.games ? r.wins / r.games : null);

/** "How the latest patch affects you". Streams behind Suspense; a failure blanks only this card. */
export async function PatchDigestSection({ user }: { user: User }) {
  const t = await getT();
  let digest: PatchDigest | null;
  let heroes: Map<number, HeroInfo>;
  try {
    [digest, heroes] = await Promise.all([
      patchesService.latestDigest(user, new Date()),
      matchesService.heroMap(),
    ]);
  } catch (error) {
    logger.error("patch_digest_failed", { error });
    return (
      <MetaSection
        id="patch-digest"
        kicker={t("dashboard.patch.kicker")}
        title={t("dashboard.patch.title")}
      >
        <Unavailable>{t("dashboard.patch.unavailable")}</Unavailable>
      </MetaSection>
    );
  }
  if (!digest) return null;

  const { version, heroes: changed } = digest;
  return (
    <MetaSection
      id="patch-digest"
      kicker={t("dashboard.patch.patchKicker", { version })}
      title={
        changed.length
          ? t(
              changed.length === 1
                ? "dashboard.patch.changed.one"
                : "dashboard.patch.changed.other",
              { version, n: changed.length },
            )
          : t("dashboard.patch.unchanged", { version })
      }
      description={t("dashboard.patch.description")}
      footer={
        <Link href={`/patches/${version}`} className="text-gold hover:underline">
          {changed.length > SHOWN
            ? t("dashboard.patch.seeAll", { n: changed.length, version })
            : t("dashboard.patch.allOf", { version })}
        </Link>
      }
    >
      {changed.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 px-5 pb-5 lg:grid-cols-2">
          {changed.slice(0, SHOWN).map((h) => {
            const hero = heroes.get(h.heroId);
            const name = heroName(hero, h.heroId);
            const { before, after } = h.cohort;
            const more = h.noteCount - 1;
            return (
              <li
                key={h.heroId}
                className="flex min-w-0 gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
              >
                <HeroPortrait hero={hero} heroId={h.heroId} size="md" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <Link
                    href={`/patches/${version}#hero-${h.heroId}`}
                    aria-label={t("dashboard.patch.heroLink", { hero: name, version })}
                    className="block truncate font-medium hover:text-gold"
                  >
                    {name}
                  </Link>
                  {h.highlights[0] && (
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={h.highlights.join("\n")}
                    >
                      {h.highlights[0]}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {more > 0 && <span>+{plural(t, "dashboard.patch.moreChanges", more)} · </span>}
                    {after.games === 0 ? (
                      t("dashboard.patch.noGamesSince")
                    ) : h.delta === null ? (
                      t("dashboard.patch.tooFewToCompare", {
                        before: before.games,
                        after: after.games,
                      })
                    ) : (
                      <>
                        {formatPercent(rate(before))} →{" "}
                        <span className={h.delta >= 0 ? "text-win" : "text-loss"}>
                          {formatPercent(rate(after))}
                        </span>{" "}
                        {t("dashboard.patch.compared", {
                          before: before.games,
                          after: after.games,
                        })}{" "}
                        {kdaOf(before)?.toFixed(1)} → {kdaOf(after)?.toFixed(1)}
                      </>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MetaSection>
  );
}
