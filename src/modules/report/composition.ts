import "server-only";
import { env } from "@/common/config/env";
import { getMatchQueries, openDotaGateway } from "@/modules/matches/composition";
import { mmrJournalService } from "@/modules/mmr";
import { buildCalendar } from "@/modules/mmr/domain/calendar";
import { addDays, dayKeyFormatter } from "@/common/time/day-key";
import { battleReport, type BattleReport } from "./domain/battle-report";
import { reportGames } from "./infrastructure/opendota-report-source";

export const REPORT_PERIODS = [30, 90, 180] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

const TZ_PAD_MS = 15 * 3_600_000;

export interface BattleReportView {
  report: BattleReport;
  from: string;
  to: string;
  /** Exact from your MMR entries when they bracket the period's ranked games, else null. */
  mmrExact: number | null;
  /** ±25 per ranked game: always labelled as an estimate. */
  mmrEstimate: number;
  rankedGames: number;
}

/** Null when OpenDota can't be read right now. */
export async function getBattleReport(
  user: { id: string; accountId32: number },
  days: ReportPeriod,
  timeZone: string,
): Promise<BattleReportView | null> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const dayKey = dayKeyFormatter(timeZone);
  const now = new Date();
  const to = dayKey(now);
  const from = addDays(to, -(days - 1));
  const [games, entries] = await Promise.all([
    reportGames(
      openDotaGateway(),
      { baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api", apiKey: OPENDOTA_API_KEY },
      user.accountId32,
      days,
    ),
    mmrJournalService.list({ userId: user.id, accountId32: user.accountId32 }),
  ]);
  if (!games) return null;
  const inPeriod = games.filter((g) => {
    const k = dayKey(g.startedAt);
    return k >= from && k <= to;
  });

  // MMR: the journal's rules, over our imported ranked games out to the entries either side.
  const rangeFrom = new Date(Date.parse(`${from}T00:00:00Z`) - TZ_PAD_MS);
  const before = entries.findLast((e) => e.observedAt < rangeFrom);
  const loaded = { from: before?.observedAt ?? rangeFrom, to: now };
  const ranked = await (await getMatchQueries()).rankedResults(user.accountId32, loaded);
  const calendar = buildCalendar({
    observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
    matches: ranked,
    period: { from, to },
    dayKey,
    scope: "all",
    loaded,
  });
  return {
    report: battleReport(inPeriod, dayKey),
    from,
    to,
    mmrExact: calendar.summary.actualNet,
    mmrEstimate: calendar.summary.estimatedNet,
    rankedGames: calendar.summary.games,
  };
}
