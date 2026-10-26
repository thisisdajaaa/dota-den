import type { Feature } from "./domain/usage";

export const USAGE_COLLECTION = "feature_usage";

/** One player's uses of one feature on one UTC day. `_id` is `day:feature:userId`. */
export interface FeatureUsageDocument {
  _id: string;
  day: string;
  feature: Feature;
  userId: string;
  count: number;
  /** Start of that day, for the retention TTL. */
  dayStart: Date;
  schemaVersion: number;
}
