import type { Patch } from "@/modules/patches/domain/patch";
import type { RankedHero } from "./meta-stats";
import { POSITION_INFO, type Position } from "./position";

/** A hero's entry in the latest patch, as plain lines of Valve's original wording. */
export interface HeroPatchChange {
  heroId: number;
  /** Note lines in patch order; ability notes are prefixed with the ability name. */
  lines: readonly string[];
}

export interface LatestPatch {
  version: string;
  publishedAt: Date;
  heroes: ReadonlyMap<number, HeroPatchChange>;
}

export type TipKind = "rising" | "falling" | "patch" | "contested" | "lane";

export interface Tip {
  kind: TipKind;
  text: string;
  /** In-app link backing the tip (e.g. the hero's entry on the patch page). */
  href?: string;
  /** Extra patch lines not shown in `text`. */
  more?: number;
}

/** Trend change needed before calling a hero rising or falling. */
export const TREND_THRESHOLD = 0.1;
/** Share of pro drafts a hero must be picked or banned in to be called contested. */
export const CONTESTED_THRESHOLD = 0.3;
export const STRONG_LANE_RATE = 0.52;
export const STRONG_LANE_MIN_GAMES = 200;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (n: number) => n.toLocaleString("en-US");

/** Short, data-backed tips for one ranked hero. Only states what the numbers show. */
export function tipsFor(hero: RankedHero, position: Position, patch: LatestPatch | null): Tip[] {
  const tips: Tip[] = [];
  const change = patch?.heroes.get(hero.heroId);
  if (patch && change && change.lines.length > 0) {
    tips.push({
      kind: "patch",
      text: `Changed in ${patch.version}: ${change.lines[0]}`,
      href: `/patches/${encodeURIComponent(patch.version)}#hero-${hero.heroId}`,
      more: change.lines.length - 1,
    });
  }
  if (hero.trend && hero.trend.change >= TREND_THRESHOLD) {
    tips.push({
      kind: "rising",
      text: `Rising: picked ${pct(hero.trend.change)} more often in public games over the last 3 days than earlier in the week`,
    });
  } else if (hero.trend && hero.trend.change <= -TREND_THRESHOLD) {
    tips.push({
      kind: "falling",
      text: `Falling: picked ${pct(-hero.trend.change)} less often in public games over the last 3 days than earlier in the week`,
    });
  }
  if (hero.pro && hero.pro.contestRate >= CONTESTED_THRESHOLD) {
    tips.push({
      kind: "contested",
      text: `Contested in tournaments: picked or banned in ${pct(hero.pro.contestRate)} of ${num(hero.pro.drafts)} pro drafts over the last ${hero.pro.windowDays} days`,
    });
  }
  if (hero.lane && hero.lane.rate >= STRONG_LANE_RATE && hero.lane.games >= STRONG_LANE_MIN_GAMES) {
    tips.push({
      kind: "lane",
      text: `Wins ${pct(hero.lane.rate)} of ${num(hero.lane.games)} public games played in the ${POSITION_INFO[position].laneName}`,
    });
  }
  return tips;
}

/** Hero notes of a patch as plain lines, in patch order (Valve's wording, never rewritten). */
export function heroPatchChanges(patch: Pick<Patch, "sections">): Map<number, HeroPatchChange> {
  const out = new Map<number, HeroPatchChange>();
  for (const h of patch.sections.heroes) {
    const lines = [
      ...h.heroNotes.filter((n) => !n.subtitle).map((n) => n.text),
      ...h.abilities.flatMap((a) =>
        a.notes
          .filter((n) => !n.subtitle)
          .map((n) => (a.abilityName ? `${a.abilityName}: ${n.text}` : n.text)),
      ),
      ...h.talentNotes.filter((n) => !n.subtitle).map((n) => `Talent: ${n.text}`),
    ].filter((l) => l.trim() !== "");
    out.set(h.heroId, { heroId: h.heroId, lines });
  }
  return out;
}
