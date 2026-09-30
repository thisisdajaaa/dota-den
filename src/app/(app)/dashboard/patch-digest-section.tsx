import Link from "next/link";
import { logger } from "@/lib/logger";
import type { User } from "@/modules/identity/domain/user";
import { getHeroMap } from "@/modules/matches/composition";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";
import { type PatchDigest, type Record } from "@/modules/patches/domain/digest";
import { getLatestPatchDigest } from "@/modules/patches/patch-digest";

export function PatchDigestSkeleton() {
  return <SectionSkeleton label="Loading what the latest patch changed for you" rows={3} />;
}

/** Heroes shown on the overview; the rest are one click away. */
const SHOWN = 6;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const rate = (r: Record) => (r.games ? r.wins / r.games : null);

/** "How the latest patch affects you". Streams behind Suspense; a failure blanks only this card. */
export async function PatchDigestSection({ user }: { user: User }) {
  let digest: PatchDigest | null;
  let heroes: Awaited<ReturnType<typeof getHeroMap>>;
  try {
    [digest, heroes] = await Promise.all([getLatestPatchDigest(user, new Date()), getHeroMap()]);
  } catch (error) {
    logger.error("patch_digest_failed", { error });
    return (
      <MetaSection id="patch-digest" kicker="Latest patch" title="What changed for you">
        <Unavailable>The latest patch notes are unavailable right now.</Unavailable>
      </MetaSection>
    );
  }
  if (!digest) return null;

  const { version, heroes: changed } = digest;
  return (
    <MetaSection
      id="patch-digest"
      kicker={`Patch ${version}`}
      title={
        changed.length
          ? `${version} changed ${changed.length} ${changed.length === 1 ? "hero" : "heroes"} you play`
          : `${version} didn't change the heroes you play`
      }
      description="Heroes you play: 3+ ranked games in the last 90 days, or starred on a patch page."
      footer={
        <Link href={`/patches/${version}`} className="text-gold hover:underline">
          {changed.length > SHOWN ? `See all ${changed.length} in ${version}` : `All of ${version}`}
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
                    aria-label={`What changed for ${name} in ${version}`}
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
                    {more > 0 && <span>+{plural(more, "more change")} · </span>}
                    {after.games === 0 ? (
                      "no ranked games since"
                    ) : h.delta === null ? (
                      `${before.games} before, ${after.games} since (too few to compare)`
                    ) : (
                      <>
                        {formatPercent(rate(before))} →{" "}
                        <span className={h.delta >= 0 ? "text-win" : "text-loss"}>
                          {formatPercent(rate(after))}
                        </span>{" "}
                        ({before.games} before, {after.games} since)
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
