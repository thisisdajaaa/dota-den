/**
 * Draft report card (pure): the rubric a draft is judged by, per side.
 *
 * Six criteria, each scored 0-100 where 50 is an average draft, then weighted into an
 * overall grade. Every score comes from the same public data as the rest of the outlook;
 * a criterion with no data is marked unavailable and left out of the overall grade.
 *
 *   Lanes          pro lane results of the heroes meeting in each lane
 *   Counters       head-to-head records against the enemy heroes
 *   Composition    initiation, control, frontline, late game, pushing (role tags)
 *   Hero strength  win rates this patch at high ranks, and in pro games
 *   Positions      how naturally the heroes fill positions 1-5
 *   Combos         how hero pairs do together in pro games
 *
 * Weights are half the prior (PRIOR_WEIGHTS: 20/20/20/15/15/10%) and half the weights fitted
 * to real games in draft-calibration.json (see blendedWeights). With the current fit that is
 * roughly Hero strength 42%, Lanes, Counters, Composition and Positions 12% each, Combos 9%;
 * CRITERIA holds the exact values in use.
 */

import calibration from "./draft-calibration.json";
import { POSITION_NAMES, positionPhrase, type Position } from "./draft-positions";
import { phrase, type Phrase } from "./phrase";

export type CriterionKey =
  "lanes" | "counters" | "composition" | "strength" | "positions" | "combos";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Criterion {
  key: CriterionKey;
  label: string;
  weight: number;
  /** 0-100 (50 = average), or null when there's no data for it yet. */
  score: number | null;
  grade: Grade | null;
  /** One plain-language line on why. */
  summary: string;
  /** The same line for the UI to translate. */
  summaryPhrase: Phrase;
}

export interface SideReport {
  criteria: Criterion[];
  /** Weighted score over the criteria with data; null before any hero is picked. */
  overall: number | null;
  grade: Grade | null;
}

export interface DraftReport {
  radiant: SideReport;
  dire: SideReport;
  /** The criteria with the biggest gap between the sides, biggest first. */
  deciders: { key: CriterionKey; label: string; favours: "radiant" | "dire"; gap: number }[];
  /** True until both lineups are complete. */
  provisional: boolean;
}

/** The weights we started from, before fitting to real games. */
const PRIOR_WEIGHTS: Record<CriterionKey, number> = {
  lanes: 0.2,
  counters: 0.2,
  composition: 0.2,
  strength: 0.15,
  positions: 0.15,
  combos: 0.1,
};

/**
 * Half the prior weights, half the weights fitted to real games (see draft-calibration.json):
 * the fit says hero strength matters most in public games, but a report card that is only
 * hero strength wouldn't teach much, so the fit moves the weights rather than replacing them.
 */
function blendedWeights(): Record<CriterionKey, number> {
  const fitted = calibration.criteriaWeights as Record<CriterionKey, number>;
  const keys = Object.keys(PRIOR_WEIGHTS) as CriterionKey[];
  const mixed = keys.map((k) => 0.5 * PRIOR_WEIGHTS[k] + 0.5 * (fitted[k] ?? PRIOR_WEIGHTS[k]));
  const total = mixed.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    keys.map((k, i) => [k, Math.round((mixed[i] / total) * 100) / 100]),
  ) as Record<CriterionKey, number>;
}
const WEIGHTS = blendedWeights();

export const CRITERIA: readonly { key: CriterionKey; label: string; weight: number }[] = [
  { key: "lanes", label: "Lanes", weight: WEIGHTS.lanes },
  { key: "counters", label: "Counters", weight: WEIGHTS.counters },
  { key: "composition", label: "Composition", weight: WEIGHTS.composition },
  { key: "strength", label: "Hero strength", weight: WEIGHTS.strength },
  { key: "positions", label: "Positions", weight: WEIGHTS.positions },
  { key: "combos", label: "Combos", weight: WEIGHTS.combos },
];

export function gradeOf(score: number): Grade {
  if (score >= 75) return "A";
  if (score >= 62) return "B";
  if (score >= 50) return "C";
  if (score >= 38) return "D";
  return "F";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

export type CompositionCheckId =
  "initiation" | "control" | "frontline" | "late_game" | "burst" | "tower_pressure";

export interface CompositionCheck {
  id: CompositionCheckId;
  label: string;
  passed: boolean;
  /** e.g. "Axe, Mars" or "no hero tagged Initiator". */
  detail: string;
}

/** The evidence for one side, gathered by the outlook. */
export interface SideEvidence {
  heroes: number;
  /** Average lane edge across the lanes this side has contested (points). */
  laneEdge: number | null;
  lanesWithData: number;
  /** How many of those lanes use pro lane results (the rest use head-to-heads). */
  proLanes: number;
  /** Average head-to-head advantage per hero (points). */
  counterEdge: number | null;
  /** Average hero win rate edge this patch (points), with pro results folded in. */
  strengthEdge: number | null;
  /** Geometric mean of how often the pros play each hero at its position (0..1). */
  positionFit: number | null;
  /** Heroes at a position the pros rarely play them at. */
  offRole: { hero: string; position: Position }[];
  /** Average same-team pair edge in pro games (points). */
  comboEdge: number | null;
  comboPairs: number;
  composition: CompositionCheck[];
}

type Scored = { score: number | null; summary: string; summaryPhrase: Phrase };

/** A criterion without data: its English line and message id (`report.<id>`). */
const noData = (summary: string, id: string): Scored => ({
  score: null,
  summary,
  summaryPhrase: phrase(`report.${id}`),
});

export function sideReport(e: SideEvidence): SideReport {
  const score = (key: CriterionKey): Scored => {
    switch (key) {
      case "lanes": {
        if (e.laneEdge === null)
          return noData("No lane matchups with enough pro games yet.", "lanesNone");
        const edge = signed(e.laneEdge);
        const allPro = e.proLanes === e.lanesWithData;
        const h2h = e.lanesWithData - e.proLanes;
        return {
          score: clamp(50 + e.laneEdge * 4),
          summary: `${edge} points per lane (${
            allPro
              ? `${e.proLanes} from pro lane results`
              : `${e.proLanes} from pro lane results, ${h2h} from head-to-heads`
          }).`,
          summaryPhrase: allPro
            ? phrase("report.lanesPro", { edge, pro: e.proLanes })
            : phrase("report.lanesMixed", { edge, pro: e.proLanes, h2h }),
        };
      }
      case "counters": {
        if (e.counterEdge === null)
          return noData("Not enough head-to-head games against the enemy heroes.", "countersNone");
        const edge = signed(e.counterEdge);
        return {
          score: clamp(50 + e.counterEdge * 6),
          summary: `${edge} points per hero against the enemy lineup.`,
          summaryPhrase: phrase("report.counters", { edge }),
        };
      }
      case "composition": {
        if (e.heroes === 0) return noData("No heroes yet.", "compositionNone");
        const passed = e.composition.filter((c) => c.passed).length;
        const failed = e.composition.filter((c) => !c.passed);
        const missing = failed.map((c) => c.label.toLowerCase());
        const total = e.composition.length;
        return {
          score: clamp((passed / total) * 100),
          summary: missing.length
            ? `${passed} of ${total} covered; missing ${missing.join(", ")}.`
            : `All ${total} covered.`,
          summaryPhrase: missing.length
            ? phrase("report.compositionMissing", {
                passed,
                total,
                missing: failed.map((c) => phrase(`report.checks.${c.id}`)),
              })
            : phrase("report.compositionAll", { total }),
        };
      }
      case "strength": {
        if (e.strengthEdge === null)
          return noData("No win rate data for these heroes.", "strengthNone");
        const edge = signed(e.strengthEdge);
        return {
          score: clamp(50 + e.strengthEdge * 8),
          summary: `${edge} points per hero versus an even win rate this patch.`,
          summaryPhrase: phrase("report.strength", { edge }),
        };
      }
      case "positions": {
        if (e.positionFit === null) return noData("No pro position data.", "positionsNone");
        const base = Math.min(1, e.positionFit / 0.55) * 100 - e.offRole.length * 15;
        const typical = Math.round(e.positionFit * 100);
        return {
          score: clamp(base),
          summary: e.offRole.length
            ? `Off-role: ${e.offRole.map((o) => `${o.hero} at ${POSITION_NAMES[o.position]}`).join(", ")}.`
            : `Every hero is at a position the pros often play it (${typical}% typical).`,
          summaryPhrase: e.offRole.length
            ? phrase("report.offRole", {
                heroes: e.offRole.map((o) =>
                  phrase("report.offRoleHero", {
                    hero: o.hero,
                    position: positionPhrase(o.position),
                  }),
                ),
              })
            : phrase("report.positionsTypical", { typical }),
        };
      }
      case "combos": {
        if (e.comboEdge === null)
          return noData("These heroes rarely play together in pro games.", "combosNone");
        const edge = signed(e.comboEdge);
        return {
          score: clamp(50 + e.comboEdge * 8),
          summary: `${edge} points per pair across ${e.comboPairs} pro pairing${e.comboPairs === 1 ? "" : "s"}.`,
          summaryPhrase: phrase("report.combos", { edge }, e.comboPairs),
        };
      }
    }
  };

  const criteria: Criterion[] = CRITERIA.map((c) => {
    const s = score(c.key);
    return { ...c, ...s, grade: s.score === null ? null : gradeOf(s.score) };
  });
  const scored = criteria.filter((c) => c.score !== null);
  const weight = scored.reduce((a, c) => a + c.weight, 0);
  const overall =
    e.heroes === 0 || weight === 0
      ? null
      : Math.round(scored.reduce((a, c) => a + c.score! * c.weight, 0) / weight);
  return { criteria, overall, grade: overall === null ? null : gradeOf(overall) };
}

export function draftReport(
  radiant: SideEvidence,
  dire: SideEvidence,
  complete: boolean,
): DraftReport {
  const r = sideReport(radiant);
  const d = sideReport(dire);
  const deciders = CRITERIA.flatMap((c) => {
    const a = r.criteria.find((x) => x.key === c.key)!.score;
    const b = d.criteria.find((x) => x.key === c.key)!.score;
    if (a === null || b === null || Math.abs(a - b) < 8) return [];
    return [
      {
        key: c.key,
        label: c.label,
        favours: (a > b ? "radiant" : "dire") as "radiant" | "dire",
        gap: Math.abs(a - b),
      },
    ];
  }).sort((x, y) => y.gap * weightOf(y.key) - x.gap * weightOf(x.key));
  return { radiant: r, dire: d, deciders, provisional: !complete };
}

const weightOf = (key: CriterionKey) => CRITERIA.find((c) => c.key === key)!.weight;

/** Composition checks from role tags (and the carry's position). */
export function compositionChecks(
  team: readonly { name: string; roles: readonly string[] }[],
  carryAtPos1: { name: string; roles: readonly string[] } | null,
): CompositionCheck[] {
  const tagged = (tag: string) => team.filter((h) => h.roles.includes(tag)).map((h) => h.name);
  const list = (names: string[]) => names.join(", ");
  const initiators = tagged("Initiator");
  const disablers = tagged("Disabler");
  const durable = tagged("Durable");
  const pushers = tagged("Pusher");
  const nukers = tagged("Nuker");
  const lateCarry = carryAtPos1?.roles.includes("Carry") ? carryAtPos1.name : null;
  return [
    {
      id: "initiation",
      label: "Initiation",
      passed: initiators.length >= 1,
      detail: initiators.length ? list(initiators) : "no hero tagged Initiator",
    },
    {
      id: "control",
      label: "Control",
      passed: disablers.length >= 2,
      detail: disablers.length ? `${list(disablers)} (2+ wanted)` : "no hero tagged Disabler",
    },
    {
      id: "frontline",
      label: "Frontline",
      passed: durable.length >= 1,
      detail: durable.length ? list(durable) : "no hero tagged Durable",
    },
    {
      id: "late_game",
      label: "Late game",
      passed: lateCarry !== null,
      detail: lateCarry ?? "no Carry-tagged hero at position 1",
    },
    {
      id: "burst",
      label: "Burst damage",
      passed: nukers.length >= 2,
      detail: nukers.length ? `${list(nukers)} (2+ wanted)` : "no hero tagged Nuker",
    },
    {
      id: "tower_pressure",
      label: "Tower pressure",
      passed: pushers.length >= 1,
      detail: pushers.length ? list(pushers) : "no hero tagged Pusher",
    },
  ];
}
