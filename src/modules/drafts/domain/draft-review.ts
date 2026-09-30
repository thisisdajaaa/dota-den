/**
 * AI draft review (pure parts): the shape of a language model's review of a finished draft,
 * and the rules that keep it honest.
 *
 * The data report card stays the source of truth. The model adds what numbers miss (hero
 * combos, spell interactions, win conditions) from the evidence we give it, including each
 * hero's current abilities. It may nudge only the Combos and Composition grades, by at most
 * MAX_ADJUSTMENT points, and every nudge needs a reason. Anything naming a hero that isn't in
 * the draft is dropped.
 */
import type { CriterionKey, DraftReport, Grade, SideReport } from "./draft-report";
import { gradeOf } from "./draft-report";
import type { Side } from "./draft-state";

export const MAX_ADJUSTMENT = 8;
export const ADJUSTABLE: readonly CriterionKey[] = ["combos", "composition"];

/** One ability, compact enough to send for ten heroes. */
export interface AbilityBrief {
  name: string;
  /** First sentence or so of the official description. */
  desc: string;
  tags: string[];
}

export interface HeroKit {
  heroId: number;
  abilities: AbilityBrief[];
}

export interface SidePlan {
  winCondition: string;
  strengths: string[];
  risks: string[];
  /** When the lineup is strongest, e.g. "10-20 minutes with Black King Bar on Sven". */
  timing: string;
}

export interface Combo {
  side: Side;
  heroes: string[];
  why: string;
}

export interface KeyMatchup {
  heroes: string[];
  note: string;
}

export interface Adjustment {
  side: Side;
  criterion: CriterionKey;
  delta: number;
  reason: string;
}

export interface DraftReview {
  summary: string;
  sides: Record<Side, SidePlan>;
  combos: Combo[];
  keyMatchups: KeyMatchup[];
  adjustments: Adjustment[];
}

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const texts = (v: unknown, max: number, count: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => text(x, max))
        .filter((x): x is string => !!x)
        .slice(0, count)
    : [];
const isSide = (v: unknown): v is Side => v === "radiant" || v === "dire";

/**
 * Validate the model's JSON against the draft. Returns null if the core of it is missing;
 * otherwise drops anything that names heroes outside the draft or breaks the rules.
 */
export function validateReview(raw: unknown, heroNames: readonly string[]): DraftReview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const known = new Set(heroNames.map((n) => n.toLowerCase()));
  const allKnown = (names: string[]) =>
    names.length > 0 && names.every((n) => known.has(n.toLowerCase()));

  const plan = (v: unknown): SidePlan | null => {
    if (!v || typeof v !== "object") return null;
    const p = v as Record<string, unknown>;
    const winCondition = text(p.winCondition, 300);
    if (!winCondition) return null;
    return {
      winCondition,
      strengths: texts(p.strengths, 200, 4),
      risks: texts(p.risks, 200, 4),
      timing: text(p.timing, 200) ?? "",
    };
  };
  const sides = r.sides as Record<string, unknown> | undefined;
  const radiant = plan(sides?.radiant);
  const dire = plan(sides?.dire);
  const summary = text(r.summary, 500);
  if (!summary || !radiant || !dire) return null;

  const combos: Combo[] = (Array.isArray(r.combos) ? r.combos : [])
    .map((c: Record<string, unknown>) => ({
      side: c?.side,
      heroes: texts(c?.heroes, 40, 5),
      why: text(c?.why, 300),
    }))
    .filter((c): c is Combo => isSide(c.side) && !!c.why && allKnown(c.heroes))
    .slice(0, 6);

  const keyMatchups: KeyMatchup[] = (Array.isArray(r.keyMatchups) ? r.keyMatchups : [])
    .map((m: Record<string, unknown>) => ({
      heroes: texts(m?.heroes, 40, 4),
      note: text(m?.note, 300),
    }))
    .filter((m): m is KeyMatchup => !!m.note && allKnown(m.heroes))
    .slice(0, 6);

  const seen = new Set<string>();
  const adjustments: Adjustment[] = (Array.isArray(r.adjustments) ? r.adjustments : [])
    .map((a: Record<string, unknown>) => ({
      side: a?.side,
      criterion: a?.criterion,
      delta: typeof a?.delta === "number" ? Math.round(a.delta) : NaN,
      reason: text(a?.reason, 300),
    }))
    .filter(
      (a): a is Adjustment =>
        isSide(a.side) &&
        ADJUSTABLE.includes(a.criterion as CriterionKey) &&
        Number.isFinite(a.delta) &&
        a.delta !== 0 &&
        !!a.reason,
    )
    .map((a) => ({ ...a, delta: Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, a.delta)) }))
    // One nudge per side and criterion.
    .filter((a) => {
      const key = `${a.side}:${a.criterion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { summary, sides: { radiant, dire }, combos, keyMatchups, adjustments };
}

/** The report card with the AI's nudges applied (for display next to the data grades). */
export function applyAdjustments(
  report: DraftReport,
  adjustments: readonly Adjustment[],
): DraftReport {
  const side = (s: Side): SideReport => {
    const criteria = report[s].criteria.map((c) => {
      const a = adjustments.find((x) => x.side === s && x.criterion === c.key);
      if (!a || c.score === null) return c;
      const score = Math.max(0, Math.min(100, c.score + a.delta));
      return { ...c, score, grade: gradeOf(score) as Grade };
    });
    const scored = criteria.filter((c) => c.score !== null);
    const weight = scored.reduce((acc, c) => acc + c.weight, 0);
    const overall =
      report[s].overall === null || weight === 0
        ? null
        : Math.round(scored.reduce((acc, c) => acc + c.score! * c.weight, 0) / weight);
    return { criteria, overall, grade: overall === null ? null : gradeOf(overall) };
  };
  return { ...report, radiant: side("radiant"), dire: side("dire") };
}

/** Compact tags for an ability, from OpenDota's constants. */
export function abilityTags(a: {
  behavior?: unknown;
  dmg_type?: unknown;
  bkbpierce?: unknown;
  target_team?: unknown;
}): string[] {
  const tags: string[] = [];
  const behavior = String(a.behavior ?? "");
  for (const b of ["Passive", "Channeled", "Aura", "Toggle", "AOE"]) {
    if (behavior.includes(b)) tags.push(b.toLowerCase());
  }
  if (a.dmg_type === "Magical" || a.dmg_type === "Physical" || a.dmg_type === "Pure") {
    tags.push(`${String(a.dmg_type).toLowerCase()} damage`);
  }
  if (a.bkbpierce === "Yes") tags.push("pierces spell immunity");
  if (a.target_team === "Friendly") tags.push("targets allies");
  return tags;
}

/** First sentence of an official description, trimmed for the prompt. */
export function briefDescription(desc: unknown, max = 160): string {
  const s = String(desc ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const first = s.split(/(?<=\.)\s/)[0] ?? s;
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
