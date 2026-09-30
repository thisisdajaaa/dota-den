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

export interface CompositionCheck {
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
  offRole: string[];
  /** Average same-team pair edge in pro games (points). */
  comboEdge: number | null;
  comboPairs: number;
  composition: CompositionCheck[];
}

export function sideReport(e: SideEvidence): SideReport {
  const score = (key: CriterionKey): { score: number | null; summary: string } => {
    switch (key) {
      case "lanes":
        return e.laneEdge === null
          ? { score: null, summary: "No lane matchups with enough pro games yet." }
          : {
              score: clamp(50 + e.laneEdge * 4),
              summary: `${signed(e.laneEdge)} points per lane (${
                e.proLanes === e.lanesWithData
                  ? `${e.proLanes} from pro lane results`
                  : `${e.proLanes} from pro lane results, ${e.lanesWithData - e.proLanes} from head-to-heads`
              }).`,
            };
      case "counters":
        return e.counterEdge === null
          ? { score: null, summary: "Not enough head-to-head games against the enemy heroes." }
          : {
              score: clamp(50 + e.counterEdge * 6),
              summary: `${signed(e.counterEdge)} points per hero against the enemy lineup.`,
            };
      case "composition": {
        if (e.heroes === 0) return { score: null, summary: "No heroes yet." };
        const passed = e.composition.filter((c) => c.passed).length;
        const missing = e.composition.filter((c) => !c.passed).map((c) => c.label.toLowerCase());
        return {
          score: clamp((passed / e.composition.length) * 100),
          summary: missing.length
            ? `${passed} of ${e.composition.length} covered; missing ${missing.join(", ")}.`
            : `All ${e.composition.length} covered.`,
        };
      }
      case "strength":
        return e.strengthEdge === null
          ? { score: null, summary: "No win rate data for these heroes." }
          : {
              score: clamp(50 + e.strengthEdge * 8),
              summary: `${signed(e.strengthEdge)} points per hero versus an even win rate this patch.`,
            };
      case "positions": {
        if (e.positionFit === null) return { score: null, summary: "No pro position data." };
        const base = Math.min(1, e.positionFit / 0.55) * 100 - e.offRole.length * 15;
        return {
          score: clamp(base),
          summary: e.offRole.length
            ? `Off-role: ${e.offRole.join(", ")}.`
            : `Every hero is at a position the pros often play it (${Math.round(e.positionFit * 100)}% typical).`,
        };
      }
      case "combos":
        return e.comboEdge === null
          ? { score: null, summary: "These heroes rarely play together in pro games." }
          : {
              score: clamp(50 + e.comboEdge * 8),
              summary: `${signed(e.comboEdge)} points per pair across ${e.comboPairs} pro pairing${e.comboPairs === 1 ? "" : "s"}.`,
            };
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
      label: "Initiation",
      passed: initiators.length >= 1,
      detail: initiators.length ? list(initiators) : "no hero tagged Initiator",
    },
    {
      label: "Control",
      passed: disablers.length >= 2,
      detail: disablers.length ? `${list(disablers)} (2+ wanted)` : "no hero tagged Disabler",
    },
    {
      label: "Frontline",
      passed: durable.length >= 1,
      detail: durable.length ? list(durable) : "no hero tagged Durable",
    },
    {
      label: "Late game",
      passed: lateCarry !== null,
      detail: lateCarry ?? "no Carry-tagged hero at position 1",
    },
    {
      label: "Burst damage",
      passed: nukers.length >= 2,
      detail: nukers.length ? `${list(nukers)} (2+ wanted)` : "no hero tagged Nuker",
    },
    {
      label: "Tower pressure",
      passed: pushers.length >= 1,
      detail: pushers.length ? list(pushers) : "no hero tagged Pusher",
    },
  ];
}
