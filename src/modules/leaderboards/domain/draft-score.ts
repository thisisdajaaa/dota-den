import type { ActivitySide } from "./activity";

/** The draft report card's letter grade, as the drafts context reports it. */
export const DRAFT_GRADES = ["A", "B", "C", "D", "F"] as const;
export type DraftGrade = (typeof DRAFT_GRADES)[number];

/**
 * The parts of the drafts context's outlook this context reads. `report` is read
 * defensively (structurally), so a missing or older report falls back to the win estimate.
 */
export interface OutlookLike {
  radiantPct: number | null;
  report?: unknown;
}

export interface DraftScore {
  /** 0–100 (50 = average). */
  score: number;
  /** The report card grade; null when the score came from the win estimate. */
  grade: DraftGrade | null;
}

const clampScore = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * The draft score for one side: the report card's overall score (and grade) for that side
 * when it has one, else that side's share of the win estimate. Null when neither exists.
 */
export function draftScoreFor(outlook: OutlookLike, side: ActivitySide): DraftScore | null {
  const report = field(outlook.report, side);
  const overall = field(report, "overall");
  if (typeof overall === "number" && Number.isFinite(overall)) {
    const grade = field(report, "grade");
    return {
      score: clampScore(overall),
      grade: (DRAFT_GRADES as readonly unknown[]).includes(grade) ? (grade as DraftGrade) : null,
    };
  }
  const pct = outlook.radiantPct;
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  return { score: clampScore(side === "radiant" ? pct : 100 - pct), grade: null };
}
