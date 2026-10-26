/**
 * Feature usage (pure): how often each paid or AI feature is actually used, and by how many
 * players, so the admin page shows what's worth building on. One counter per player, feature
 * and UTC day; nothing about what was asked or shown.
 */

export const FEATURES = [
  "coach_review",
  "auto_review",
  "period_read",
  "pick_for_me",
  "compare",
  "discord_command",
  "session_push",
] as const;
export type Feature = (typeof FEATURES)[number];

/** Counters are kept this long (the admin page shows the last 30 days). */
export const USAGE_RETENTION_DAYS = 90;

const DAY = 86_400_000;

/** The UTC day a use counts on ("YYYY-MM-DD"). */
export function usageDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export interface UsageRow {
  day: string;
  feature: Feature;
  userId: string;
  count: number;
}

export interface UsageWindow {
  uses: number;
  /** Players who used it at least once. */
  players: number;
}

export interface FeatureUsage {
  feature: Feature;
  last7: UsageWindow;
  last30: UsageWindow;
}

/** Uses and players per feature over the last 7 and 30 days (today included). */
export function summarizeUsage(rows: readonly UsageRow[], now: Date): FeatureUsage[] {
  const since = (days: number) => usageDay(new Date(now.getTime() - (days - 1) * DAY));
  const window = (feature: Feature, days: number): UsageWindow => {
    const from = since(days);
    const hits = rows.filter((r) => r.feature === feature && r.day >= from);
    return {
      uses: hits.reduce((n, r) => n + r.count, 0),
      players: new Set(hits.map((r) => r.userId)).size,
    };
  };
  return FEATURES.map((feature) => ({
    feature,
    last7: window(feature, 7),
    last30: window(feature, 30),
  }));
}
