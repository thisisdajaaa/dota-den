import type { GroundFact } from "@/common/utils/grounding";
import type { ReadPoint } from "../../domain/period-read";

/** The AI read of a period, as the report page shows it. */
export interface PeriodReadDto {
  points: ReadPoint[];
  /** The facts it was written from (shown next to each point). */
  facts: GroundFact[];
  createdAt: string;
  cached: boolean;
}
