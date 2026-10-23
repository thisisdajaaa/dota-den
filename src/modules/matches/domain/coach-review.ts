/**
 * The AI match coach's review (pure): what a review is, the checks every model answer must
 * pass before anyone sees it, and the free quota (ADR 0014).
 */
import { err, ok, type Result } from "@/common/result";
import { factText, ungroundedNumbers, type CoachFact, type CoachFactSheet } from "./coach-facts";

export const COACH_MIN_POINTS = 3;
export const COACH_MAX_POINTS = 5;

export type CoachPointKind = "strength" | "improve";

/** One coaching point as the model wrote it, citing facts by key. */
export interface CoachPoint {
  kind: CoachPointKind;
  title: string;
  detail: string;
  factKeys: string[];
}

/** A coaching point with the facts it cites, resolved from our sheet (what the UI shows). */
export interface ResolvedCoachPoint extends Omit<CoachPoint, "factKeys"> {
  facts: CoachFact[];
}

/**
 * Checks a model answer against the sheet: 3–5 points, every cited key exists, every point
 * cites at least one fact, and every number in the text is one of the sheet's values.
 * Problems are returned in plain words, to send back to the model on the one retry.
 */
export function checkCoachPoints(
  points: readonly CoachPoint[],
  sheet: CoachFactSheet,
): Result<CoachPoint[], string[]> {
  const problems: string[] = [];
  if (points.length < COACH_MIN_POINTS || points.length > COACH_MAX_POINTS)
    problems.push(
      `Write ${COACH_MIN_POINTS} to ${COACH_MAX_POINTS} points (got ${points.length}).`,
    );
  const keys = new Set(sheet.facts.map((f) => f.key));
  points.forEach((p, i) => {
    const unknown = p.factKeys.filter((k) => !keys.has(k));
    if (unknown.length) problems.push(`Point ${i + 1} cites unknown facts: ${unknown.join(", ")}.`);
    if (p.factKeys.length === 0) problems.push(`Point ${i + 1} cites no facts.`);
    const loose = ungroundedNumbers(`${p.title} ${p.detail}`, sheet);
    if (loose.length)
      problems.push(`Point ${i + 1} uses numbers that are not in FACTS: ${loose.join(", ")}.`);
  });
  return problems.length
    ? err(problems)
    : ok(points.map((p) => ({ ...p, factKeys: dedupe(p.factKeys) })));
}

const dedupe = (keys: string[]) => [...new Set(keys)];

/** The cited facts for each point, from the stored sheet (never from the model's text). */
export function resolvePoints(
  points: readonly CoachPoint[],
  sheet: Pick<CoachFactSheet, "facts">,
): ResolvedCoachPoint[] {
  const byKey = new Map(sheet.facts.map((f) => [f.key, f]));
  return points.map(({ factKeys, ...rest }) => ({
    ...rest,
    facts: factKeys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])),
  }));
}

/** The facts as the prompt lists them: `key | label | value`. */
export function factLines(sheet: CoachFactSheet, label: (f: CoachFact) => string): string[] {
  return sheet.facts.map((f) => `${f.key} | ${label(f)} | ${factText(f)}`);
}

// ---------------------------------------------------------------------------------------
// Quota: free players get one new review per rolling 7 days; Plus is unlimited. Only
// successful reviews count, and re-opening a stored review never does.
// ---------------------------------------------------------------------------------------

export const COACH_FREE_REVIEWS = 1;
export const COACH_QUOTA_WINDOW_MS = 7 * 24 * 3_600_000;

export interface CoachQuota {
  plan: "plus" | "free";
  /** Reviews per window; null for unlimited. */
  limit: number | null;
  /** Reviews left in the current window; null for unlimited. */
  remaining: number | null;
  /** When the next review frees up (free plan with none left); else null. */
  resetsAt: Date | null;
}

/**
 * The quota at `now` from the times of past reviews. A review at `t` counts while
 * `now - t < window`, so it frees up exactly one window later.
 */
export function coachQuota(
  uses: readonly Date[],
  now: Date,
  plus: boolean,
  opts: { limit?: number; windowMs?: number } = {},
): CoachQuota {
  if (plus) return { plan: "plus", limit: null, remaining: null, resetsAt: null };
  const limit = opts.limit ?? COACH_FREE_REVIEWS;
  const windowMs = opts.windowMs ?? COACH_QUOTA_WINDOW_MS;
  const since = now.getTime() - windowMs;
  const inWindow = uses
    .map((d) => d.getTime())
    .filter((t) => t > since && t <= now.getTime())
    .sort((a, b) => a - b);
  const remaining = Math.max(0, limit - inWindow.length);
  // With none left, the oldest counted review is the next to expire.
  const resetsAt = remaining > 0 ? null : new Date(inWindow[inWindow.length - limit] + windowMs);
  return { plan: "free", limit, remaining, resetsAt };
}
