import Link from "next/link";
import { ArrowUpRight, BookOpenText, Swords, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { RankedHero } from "../domain/meta-stats";
import { tipsFor, type LatestPatch, type Tip, type TipKind } from "../domain/patch-tips";
import { POSITION_INFO, type Position } from "../domain/position";
import { MetaSection, Unavailable } from "./meta-section";

const ICONS: Record<TipKind, typeof Swords> = {
  patch: BookOpenText,
  rising: TrendingUp,
  falling: TrendingDown,
  contested: Trophy,
  lane: Swords,
};

export const TIP_HEROES = 5;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (n: number) => n.toLocaleString("en-US");

/** A tip's sentence in the viewer's language, from the same numbers `tipsFor` used. */
function tipText(
  t: Translator<Messages>,
  tip: Tip,
  hero: RankedHero,
  position: Position,
  patch: LatestPatch | null,
): string {
  switch (tip.kind) {
    case "patch": {
      const line = patch?.heroes.get(hero.heroId)?.lines[0];
      return patch && line !== undefined
        ? t("meta.tips.changed", { version: patch.version, line })
        : tip.text;
    }
    case "rising":
      return hero.trend ? t("meta.tips.rising", { pct: pct(hero.trend.change) }) : tip.text;
    case "falling":
      return hero.trend ? t("meta.tips.falling", { pct: pct(-hero.trend.change) }) : tip.text;
    case "contested":
      return hero.pro
        ? t("meta.tips.contested", {
            pct: pct(hero.pro.contestRate),
            drafts: num(hero.pro.drafts),
            days: hero.pro.windowDays,
          })
        : tip.text;
    case "lane":
      return hero.lane
        ? t("meta.tips.lane", {
            pct: pct(hero.lane.rate),
            games: num(hero.lane.games),
            lane: POSITION_INFO[position].laneName,
          })
        : tip.text;
  }
}

export async function PatchTipsCard({
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
  const t = await getT();
  const rows = heroes
    .slice(0, TIP_HEROES)
    .map((h) => ({ hero: h, tips: tipsFor(h, position, patch) }))
    .filter((r) => r.tips.length > 0);

  return (
    <MetaSection
      id="meta-patch-tips"
      kicker={
        patch ? t("meta.tips.kicker", { version: patch.version }) : t("meta.tips.kickerShort")
      }
      title={t("meta.tips.title")}
      description={t("meta.tips.description", { n: TIP_HEROES })}
      footer={
        patchStatus === "unavailable"
          ? t("meta.tips.footerUnavailable")
          : patchStatus === "none"
            ? t("meta.tips.footerNone")
            : t("meta.tips.footerOk")
      }
    >
      {rows.length === 0 ? (
        <Unavailable>{t("meta.tips.empty")}</Unavailable>
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
                    {tips.map((tip) => {
                      const Icon = ICONS[tip.kind];
                      return (
                        <li
                          key={tip.kind}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-gold" />
                          <span className="whitespace-pre-line">
                            {tipText(t, tip, hero, position, patch)}
                            {tip.href && (
                              <>
                                {" "}
                                <Link
                                  href={tip.href}
                                  className="inline-flex items-center gap-0.5 font-medium text-gold hover:underline"
                                >
                                  {tip.more
                                    ? t("meta.tips.seeAll", { n: tip.more + 1 })
                                    : t("meta.tips.seeNotes")}
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
