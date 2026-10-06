import type { DataOwner } from "@/common/privacy/user-data";
import { daysBetween, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { buildCalendar } from "@/modules/mmr/domain/calendar";
import { loadWindow } from "@/modules/mmr/domain/load-window";
import { battleReport, periodTotals, type ReportGame } from "../domain/battle-report";
import { previousRange, type ReportRange } from "../domain/report-range";
import { aggregateReplays, type ReplaySummary } from "../domain/replay-summary";
import type { BattleReportView } from "../dtos/responses/battle-report.dto";
import type {
  ReplayReadsPort,
  ReplaySource,
  ReportGamesSource,
  ReportMmrSource,
} from "../report.ports";

/** Parsed matches read per page view (each is one OpenDota call); the rest wait for later. */
export const REPLAY_NEW_PER_VIEW = 5;

/**
 * The battle report (Dota Plus style): a period of your games, the period before it for
 * comparison, the MMR change by the journal's rules, and replay-only stats with their sample.
 */
export class BattleReportService {
  constructor(
    private readonly deps: {
      games: ReportGamesSource;
      replays: ReplaySource;
      reads: ReplayReadsPort;
      mmr: ReportMmrSource;
      now?: () => Date;
    },
  ) {}

  /** Null when OpenDota can't be read right now. */
  async report(
    owner: DataOwner,
    range: ReportRange,
    timeZone: string,
  ): Promise<BattleReportView | null> {
    const dayKey = dayKeyFormatter(timeZone);
    const now = this.deps.now?.() ?? new Date();
    const today = dayKey(now);
    const prev = previousRange(range);
    // OpenDota counts days back from now; one extra day covers time zone edges.
    const lookback = daysBetween(prev.from, today).length + 1;
    const [games, entries] = await Promise.all([
      this.deps.games.games(owner.accountId32, lookback),
      this.deps.mmr.entries(owner),
    ]);
    if (!games) return null;
    const between = (from: DayKey, to: DayKey) =>
      games.filter((g) => {
        const k = dayKey(g.startedAt);
        return k >= from && k <= to;
      });
    const inPeriod = between(range.from, range.to);

    // MMR: the journal's rules, over our imported ranked games out to the entries either side.
    const loaded = loadWindow(entries, range, now);
    const [ranked, replays] = await Promise.all([
      this.deps.mmr.rankedResults(owner.accountId32, loaded),
      this.replaySummaries(owner.accountId32, inPeriod),
    ]);
    const calendar = buildCalendar({
      observations: entries,
      matches: ranked,
      period: { from: range.from, to: range.to },
      dayKey,
      scope: "all",
      loaded,
    });
    return {
      report: battleReport(inPeriod, dayKey),
      from: range.from,
      to: range.to,
      mmrExact: calendar.summary.actualNet,
      mmrEstimate: calendar.summary.estimatedNet,
      rankedGames: calendar.summary.games,
      previous: { ...prev, totals: periodTotals(between(prev.from, prev.to)) },
      current: periodTotals(inPeriod),
      replays,
    };
  }

  /** Summaries for the period's parsed games: saved ones, plus a few new reads per view. */
  private async replaySummaries(accountId32: number, games: readonly ReportGame[]) {
    const parsed = games
      .filter((g) => g.parsed)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const saved = await this.deps.reads.find(
      accountId32,
      parsed.map((g) => g.matchId),
    );
    const missing = parsed.filter((g) => !saved.has(g.matchId)).slice(0, REPLAY_NEW_PER_VIEW);
    for (const g of missing) {
      const s = await this.deps.replays.read(g.matchId, accountId32).catch(() => null);
      if (!s) continue;
      saved.set(g.matchId, s);
      await this.deps.reads.save(g.matchId, accountId32, s).catch(() => {});
    }
    const summaries: ReplaySummary[] = parsed.flatMap((g) =>
      saved.has(g.matchId) ? [saved.get(g.matchId)!] : [],
    );
    return { aggregate: aggregateReplays(summaries), parsedInPeriod: parsed.length };
  }

  /** Replay summaries are derived from public matches; the export says how many are kept. */
  async exportMyData(owner: DataOwner) {
    return { replaySummaries: await this.deps.reads.countForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { replaySummaries: await this.deps.reads.deleteForOwner(owner) };
  }
}
