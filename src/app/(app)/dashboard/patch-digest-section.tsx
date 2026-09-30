import Link from "next/link";
import { logger } from "@/lib/logger";
import type { User } from "@/modules/identity/domain/user";
import { getHeroMap } from "@/modules/matches/composition";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";
import { MIN_COHORT_GAMES, type PatchDigest, type Record } from "@/modules/patches/domain/digest";
import { getLatestPatchDigest } from "@/modules/patches/patch-digest";

export function PatchDigestSkeleton() {
  return <SectionSkeleton label="Loading what the latest patch changed for you" rows={3} />;
}

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
          ? `${plural(changed.length, "of your heroes")} changed in ${version}`
          : `${version} didn't change your heroes`
      }
      description="Your heroes: 3+ ranked games in the last 90 days, or starred on a patch page."
      footer={
        <Link href={`/patches/${version}`} className="text-gold hover:underline">
          All of {version}
        </Link>
      }
    >
      {changed.length > 0 && (
        <ul className="divide-y divide-white/[0.05]">
          {changed.slice(0, 5).map((h) => {
            const hero = heroes.get(h.heroId);
            const name = heroName(hero, h.heroId);
            const { before, after } = h.cohort;
            return (
              <li key={h.heroId} className="flex gap-3 py-3">
                <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/patches/${version}#hero-${h.heroId}`}
                    className="font-medium hover:text-gold"
                  >
                    {name}
                  </Link>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {h.highlights.map((line) => (
                      <li key={line} className="line-clamp-2">
                        {line}
                      </li>
                    ))}
                    {h.noteCount > h.highlights.length && (
                      <li>+{plural(h.noteCount - h.highlights.length, "more change")}</li>
                    )}
                  </ul>
                  <p className="text-xs tabular-nums">
                    {after.games === 0 ? (
                      <span className="text-muted-foreground">
                        No ranked games on it since the patch yet.
                      </span>
                    ) : h.delta === null ? (
                      <span className="text-muted-foreground">
                        {plural(before.games, "game")} before, {plural(after.games, "game")} since:
                        too few to compare ({MIN_COHORT_GAMES}+ each needed).
                      </span>
                    ) : (
                      <>
                        {formatPercent(rate(before))} before ({plural(before.games, "game")}) →{" "}
                        <span className={h.delta >= 0 ? "text-win" : "text-loss"}>
                          {formatPercent(rate(after))}
                        </span>{" "}
                        since ({plural(after.games, "game")})
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
