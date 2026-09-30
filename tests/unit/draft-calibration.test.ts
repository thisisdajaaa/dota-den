import { describe, expect, it } from "vitest";
import {
  criteriaWeightsFrom,
  evaluate,
  fitLogistic,
  sigmoid,
  type Sample,
} from "@/modules/drafts/domain/draft-calibration";
import calibration from "@/modules/drafts/domain/draft-calibration.json";
import { CRITERIA } from "@/modules/drafts/domain/draft-report";

describe("fitLogistic", () => {
  it("recovers the direction and rough size of a real effect", () => {
    // y depends on x0 (true weight 1.5) and not at all on x1.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const samples: Sample[] = Array.from({ length: 4_000 }, () => {
      const x0 = rand() * 4 - 2;
      const x1 = rand() * 4 - 2;
      return { x: [x0, x1], y: rand() < sigmoid(1.5 * x0) ? 1 : 0 };
    });
    const fit = fitLogistic(samples, { iterations: 1_500, rate: 0.5 });
    expect(fit.weights[0]).toBeGreaterThan(1.1);
    expect(fit.weights[0]).toBeLessThan(1.9);
    expect(Math.abs(fit.weights[1])).toBeLessThan(0.2);
  });
});

describe("evaluate", () => {
  it("scores accuracy and log loss", () => {
    const res = evaluate([0.9, 0.2, 0.6], [1, 0, 0]);
    expect(res.accuracy).toBeCloseTo(2 / 3);
    expect(res.logLoss).toBeGreaterThan(0);
  });
});

describe("criteriaWeightsFrom", () => {
  it("turns coefficients into shares with a floor, summing to 1", () => {
    const w = criteriaWeightsFrom(["lanes", "counters", "strength"], [0.2, -0.3, 0.8]);
    expect(w.counters).toBeGreaterThan(0);
    expect(w.strength).toBeGreaterThan(w.lanes);
    expect(w.lanes + w.counters + w.strength).toBeCloseTo(1, 2);
  });
});

describe("the committed calibration", () => {
  it("beats always picking Radiant on the held-out games, and the report weights sum to 1", () => {
    expect(calibration.holdout.fitted.accuracy).toBeGreaterThan(
      calibration.holdout.baseline.accuracy,
    );
    expect(calibration.testGames).toBeGreaterThan(500);
    expect(CRITERIA.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 1);
  });
});
