/**
 * Calibration (pure): fit the outlook's weights to real results instead of choosing them.
 *
 * Every draft becomes a few features (Radiant minus Dire) and a label (did Radiant win).
 * A logistic regression, fitted on older games and tested on newer ones it never saw,
 * gives the weights and an honest accuracy figure.
 */
import type { DraftOutlook } from "./draft-outlook";
import type { CriterionKey } from "./draft-report";

/** Features for the win estimate, in win-rate points (Radiant minus Dire). */
export const ESTIMATE_FEATURES = ["meta", "matchups", "lanes", "synergy"] as const;
export type EstimateFeature = (typeof ESTIMATE_FEATURES)[number];

export interface Calibration {
  fittedAt: string;
  /** e.g. "12,000 ranked Divine+ games from the last 14 days". */
  source: string;
  trainGames: number;
  testGames: number;
  /** The win estimate: P(Radiant wins) = sigmoid(intercept + sum(weight * feature)). */
  estimate: { intercept: number; weights: Record<EstimateFeature, number> };
  /** Report card weights, fitted from how well each criterion predicts wins (sum to 1). */
  criteriaWeights: Record<CriterionKey, number>;
  /** On the held-out (newer) games. */
  holdout: {
    fitted: { accuracy: number; logLoss: number };
    handTuned: { accuracy: number; logLoss: number };
    /** Always predicting the more common winner (Radiant or Dire). */
    baseline: { accuracy: number; logLoss: number };
  };
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function estimateFeatures(o: DraftOutlook): Record<EstimateFeature, number> {
  return {
    meta: o.sides.radiant.meta - o.sides.dire.meta,
    matchups: o.sides.radiant.matchups - o.sides.dire.matchups,
    lanes: o.sides.radiant.lanes - o.sides.dire.lanes,
    synergy: o.sides.radiant.synergy - o.sides.dire.synergy,
  };
}

/** Criterion score differences (Radiant minus Dire, /10), 0 when either side lacks data. */
export function criteriaFeatures(o: DraftOutlook): Record<CriterionKey, number> {
  const out = {} as Record<CriterionKey, number>;
  for (const c of o.report.radiant.criteria) {
    const d = o.report.dire.criteria.find((x) => x.key === c.key);
    out[c.key] = c.score !== null && d?.score != null ? (c.score - d.score) / 10 : 0;
  }
  return out;
}

export interface Sample {
  x: number[];
  y: 0 | 1;
}

/** L2-regularised logistic regression by gradient descent (small data, a few features). */
export function fitLogistic(
  samples: readonly Sample[],
  opts: { iterations?: number; rate?: number; l2?: number } = {},
): { intercept: number; weights: number[] } {
  const n = samples.length;
  const k = samples[0]?.x.length ?? 0;
  let b = 0;
  const w = new Array<number>(k).fill(0);
  const iterations = opts.iterations ?? 2_000;
  const rate = opts.rate ?? 0.1;
  const l2 = opts.l2 ?? 1e-3;
  for (let it = 0; it < iterations; it++) {
    let gb = 0;
    const gw = new Array<number>(k).fill(0);
    for (const s of samples) {
      const p = sigmoid(b + s.x.reduce((a, xi, i) => a + xi * w[i], 0));
      const e = p - s.y;
      gb += e;
      for (let i = 0; i < k; i++) gw[i] += e * s.x[i];
    }
    b -= (rate * gb) / n;
    for (let i = 0; i < k; i++) w[i] -= rate * (gw[i] / n + l2 * w[i]);
  }
  return { intercept: b, weights: w };
}

export function evaluate(
  probs: readonly number[],
  labels: readonly (0 | 1)[],
): { accuracy: number; logLoss: number } {
  let correct = 0;
  let loss = 0;
  probs.forEach((p, i) => {
    const y = labels[i];
    if ((p >= 0.5 ? 1 : 0) === y) correct++;
    const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
    loss += -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
  });
  return { accuracy: correct / probs.length, logLoss: loss / probs.length };
}

/**
 * Report card weights from the fitted criterion coefficients: each criterion's share of the
 * total predictive weight, with a floor so no criterion disappears entirely.
 */
export function criteriaWeightsFrom(
  keys: readonly CriterionKey[],
  coefficients: readonly number[],
  floor = 0.05,
): Record<CriterionKey, number> {
  const raw = coefficients.map((c) => Math.max(0, c));
  const total = raw.reduce((a, b) => a + b, 0);
  const shares = raw.map((r) => (total > 0 ? r / total : 1 / raw.length));
  const floored = shares.map((s) => Math.max(floor, s));
  const sum = floored.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    keys.map((k, i) => [k, Math.round((floored[i] / sum) * 1000) / 1000]),
  ) as Record<CriterionKey, number>;
}
