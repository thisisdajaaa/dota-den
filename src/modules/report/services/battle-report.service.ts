import type { DataOwner } from "@/common/privacy/user-data";
import { mapLimit } from "@/common/utils/map-limit";
import { daysBetween, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { buildCalendar } from "@/modules/mmr/domain/calendar";
import { loadWindow } from "@/modules/mmr/domain/load-window";
import { battleReport, periodTotals, type ReportGame } from "../domain/battle-report";
import { previousRange, type ReportRange } from "../domain/report-range";
import { aggregateReplays, type ReplaySummary } from "../domain/replay-summary";
import type { BattleReportView, ReportReplaysView } from "../dtos/responses/battle-report.dto";
import type {
  ImportedGamesSource,
  ReplayReadsPort,
  ReplaySource,
  ReportGamesSource,
  ReportMmrSource,
} from "../report.ports";

/** Parsed matches read per page view (each is one OpenDota call); the rest wait for later. */
export const REPLAY_NEW_PER_VIEW = 5;
const REPLAY_CONCURRENCY = 3;
const DAY_MS = 24 * 3_600_000;

/**
 * The battle report (Dota Plus style): a period of your games, the period before it for
 * comparison, the MMR change by the journal's rules, and replay-only stats with their sample.
 * The totals and the replay stats are separate calls, so the page can show the totals while
 * replays are still being read.
 */
export class BattleReportService {
  constructor(
    private readonly deps: {
      games: ReportGamesSource;
      imported: ImportedGamesSource;
      replays: ReplaySource;
      reads: ReplayReadsPort;
      mmr: ReportMmrSource;
      now?: () => Date;
    },
  ) {}

  /** OpenDota counts days back from now; one extra day covers time zone edges. */
  private window(range: ReportRange, timeZone: string) {
    const dayKey = dayKeyFormatter(timeZone);
    const now = this.deps.now?.() ?? new Date();
    const prev = previousRange(range);
    const lookback = daysBetween(prev.from, dayKey(now)).length + 1;
    const between = (games: readonly ReportGame[], from: DayKey, to: DayKey) =>
      games.filter((g) => {
        const k = dayKey(g.startedAt);
        return k >= from && k <= to;
      });
    return { dayKey, now, prev, lookback, between };
  }

  /**
   * The period's totals, records and MMR change (no replay reads). When OpenDota can't be
   * read, the games our match sync imported stand in, with `source: "imported"`. Null when
   * neither can be read (or nothing is imported yet).
   */
  async report(
    owner: DataOwner,
    range: ReportRange,
    timeZone: string,
  ): Promise<BattleReportView | null> {
    const { dayKey, now, prev, lookback, between } = this.window(range, timeZone);
    const [listed, entries] = await Promise.all([
      this.deps.games.games(owner.accountId32, lookback).catch(() => null),
      this.deps.mmr.entries(owner),
    ]);
    let games = listed;
    let source: BattleReportView["source"] = "opendota";
    if (!games) {
      const from = new Date(now.getTime() - lookback * DAY_MS);
      games = await this.deps.imported
        .games(owner.accountId32, { from, to: now })
        .catch(() => null);
      // Nothing imported can't be told apart from no games: say it's unavailable instead.
      if (!games || games.length === 0) return null;
      source = "imported";
    }
    const inPeriod = between(games, range.from, range.to);

    // MMR: the journal's rules, over our imported ranked games out to the entries either side.
    const loaded = loadWindow(entries, range, now);
    const ranked = await this.deps.mmr.rankedResults(owner.accountId32, loaded);
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
      previous: { ...prev, totals: periodTotals(between(games, prev.from, prev.to)) },
      current: periodTotals(inPeriod),
      source,
    };
  }

  /**
   * Lane outcomes and objectives from the period's parsed games (OpenDota only: the match
   * list says which are parsed, and it's cached, so this reuses the totals' read). Null when
   * OpenDota can't be read.
   */
  async replays(
    owner: DataOwner,
    range: ReportRange,
    timeZone: string,
  ): Promise<ReportReplaysView | null> {
    const { lookback, between } = this.window(range, timeZone);
    const games = await this.deps.games.games(owner.accountId32, lookback).catch(() => null);
    if (!games) return null;
    return this.replaySummaries(owner.accountId32, between(games, range.from, range.to));
  }

  /** Summaries for the period's parsed games: saved ones, plus a few new reads per view. */
  private async replaySummaries(
    accountId32: number,
    games: readonly ReportGame[],
  ): Promise<ReportReplaysView> {
    const parsed = games
      .filter((g) => g.parsed)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    const saved = await this.deps.reads.find(
      accountId32,
      parsed.map((g) => g.matchId),
    );
    const missing = parsed.filter((g) => !saved.has(g.matchId)).slice(0, REPLAY_NEW_PER_VIEW);
    // A few at a time: each is an OpenDota match request (cached and budgeted by the gateway).
    await mapLimit(missing, REPLAY_CONCURRENCY, async (g) => {
      const s = await this.deps.replays.read(g.matchId, accountId32).catch(() => null);
      if (!s) return;
      saved.set(g.matchId, s);
      await this.deps.reads.save(g.matchId, accountId32, s).catch(() => {});
    });
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
