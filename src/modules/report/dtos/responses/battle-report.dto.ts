import type { BattleReport, PeriodTotals } from "../../domain/battle-report";
import type { ReplayAggregate } from "../../domain/replay-summary";

export interface BattleReportView {
  report: BattleReport;
  from: string;
  to: string;
  /** Exact from your MMR entries when they bracket the period's ranked games, else null. */
  mmrExact: number | null;
  /** ±25 per ranked game: always labelled as an estimate. */
  mmrEstimate: number;
  rankedGames: number;
  /** The period of the same length just before, for comparison. */
  previous: { from: string; to: string; totals: PeriodTotals };
  current: PeriodTotals;
  /** Lane outcomes and objectives from parsed replays read so far. */
  replays: { aggregate: ReplayAggregate; parsedInPeriod: number };
}
