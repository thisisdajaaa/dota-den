import Link from "next/link";
import { ArrowUpRight, BookOpenText, Swords, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { RankedHero } from "../domain/meta-stats";
import { tipsFor, type LatestPatch, type TipKind } from "../domain/patch-tips";
import type { Position } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

const ICONS: Record<TipKind, typeof Swords> = {
  patch: BookOpenText,
  rising: TrendingUp,
  falling: TrendingDown,
  contested: Trophy,
  lane: Swords,
};

export const TIP_HEROES = 5;

export function PatchTipsCard({
  position,
  heroes,
  patch,
  patchStatus,
  catalog,
}: {
  position: Position;
  heroes: readonly RankedHero[];
  patch: LatestPatch | null;
  patchStatus: "ok" | "none" | "unavailable";
  catalog: Map<number, HeroInfo>;
}) {
  const rows = heroes
    .slice(0, TIP_HEROES)
    .map((h) => ({ hero: h, tips: tipsFor(h, position, patch) }))
    .filter((r) => r.tips.length > 0);

  return (
    <MetaSection
      id="meta-patch-tips"
      kicker={patch ? `Patch ${patch.version}` : "Patch"}
      title="Patch tips"
      description={`What changed and what's moving for the top ${TIP_HEROES} heroes in this role.`}
      footer={
        patchStatus === "unavailable"
          ? "Patch notes are unavailable right now, so patch changes aren't included."
          : patchStatus === "none"
            ? "No patch notes imported yet, so patch changes aren't included."
            : "Patch changes are Valve's original wording; open the patch page for the full notes."
      }
    >
      {rows.length === 0 ? (
        <Unavailable>
          No patch changes, big pick trends or standout numbers for these heroes right now.
        </Unavailable>
      ) : (
        <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {rows.map(({ hero, tips }) => {
            const info = catalog.get(hero.heroId);
            return (
              <li key={hero.heroId} className="flex gap-3 px-5 py-3">
                <HeroPortrait hero={info} heroId={hero.heroId} size="sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-medium">{heroName(info, hero.heroId)}</p>
                  <ul className="space-y-1">
                    {tips.map((t) => {
                      const Icon = ICONS[t.kind];
                      return (
                        <li
                          key={t.kind}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-gold" />
                          <span className="whitespace-pre-line">
                            {t.text}
                            {t.href && (
                              <>
                                {" "}
                                <Link
                                  href={t.href}
                                  className="inline-flex items-center gap-0.5 font-medium text-gold hover:underline"
                                >
                                  {t.more ? `See all ${t.more + 1} changes` : "See the patch notes"}
                                  <ArrowUpRight aria-hidden className="size-3" />
                                </Link>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </MetaSection>
  );
}
