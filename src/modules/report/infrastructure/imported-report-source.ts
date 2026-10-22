import type { DashboardFact } from "@/modules/matches/domain/read-models";
import type { ReportGame } from "../domain/battle-report";

/**
 * A game imported by the match sync, as a report game. Imports keep the result, hero, side,
 * duration and K/D/A only: everything else is missing (null), never filled in, and the game
 * isn't marked parsed (we don't know), so no replay is read for it.
 */
export function importedReportGame(f: DashboardFact): ReportGame {
  return {
    matchId: f.matchId,
    startedAt: f.startedAt,
    durationSec: f.durationSec,
    heroId: f.heroId,
    side: f.side,
    won: f.result === "win",
    kills: f.kills,
    deaths: f.deaths,
    assists: f.assists,
    goldPerMin: null,
    xpPerMin: null,
    lastHits: null,
    denies: null,
    heroDamage: null,
    heroHealing: null,
    towerDamage: null,
    laneRole: null,
    parsed: false,
  };
}
