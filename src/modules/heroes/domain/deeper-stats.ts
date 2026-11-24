import { localHour } from "@/common/time/local-hour";
/**
 * Deeper stats (Plus): your record split by patch, position, time of day, game length, how
 * your lane went and who you laned with. Pure: every number is counted from your own games.
 * Games a split can't place (unknown patch, unparsed replay, old stored data) are counted
 * apart and never guessed into a bucket.
 */
import { positionForGame, type Position } from "@/modules/meta/domain/position";
import { MIN_SAMPLE, winRecord, type GameResult, type WinRecord } from "./hero-stats";

/** Patches listed, newest first. */
export const SPLIT_PATCHES = 6;
/** A lane partner needs this many games together before it's listed. */
export const MIN_PARTNER_GAMES = 3;
/** Lane partners listed, most games first. */
export const SPLIT_PARTNERS = 8;

export type DayPart = "morning" | "afternoon" | "evening" | "night";
export const DAY_PARTS: readonly DayPart[] = ["morning", "afternoon", "evening", "night"];
/** Local hours each part starts at: morning 6–12, afternoon 12–18, evening 18–24, night 0–6. */
const DAY_PART_START: Record<DayPart, number> = {
  morning: 6,
  afternoon: 12,
  evening: 18,
  night: 0,
};

export type LengthBand = "short" | "normal" | "long" | "very_long";
export const LENGTH_BANDS: readonly LengthBand[] = ["short", "normal", "long", "very_long"];
/** Minutes each band starts at: under 25, 25–35, 35–45, 45 and over. */
export const LENGTH_FROM: Record<LengthBand, number> = {
  short: 0,
  normal: 25,
  long: 35,
  very_long: 45,
};

export type LaneOutcome = "won" | "even" | "lost";
export const LANE_OUTCOMES: readonly LaneOutcome[] = ["won", "even", "lost"];

export interface SplitGame {
  matchId: string;
  heroId: number;
  startedAt: Date;
  durationSec: number;
  result: GameResult;
  patch: string | null;
}

/** What we keep from a parsed game's lanes (stored extras). */
export interface SplitLane {
  matchId: string;
  heroId: number;
  laneRole: number | null;
  roaming: boolean;
  laneResult: LaneOutcome | null;
  /** Allied heroes in your lane; undefined for games stored before we kept it. */
  lanePartnerHeroIds?: readonly number[] | null;
}

export interface SplitRow<K> extends WinRecord {
  key: K;
}

export interface PartnerRow extends WinRecord {
  heroId: number;
}

export interface DeeperStats {
  overall: WinRecord;
  /** Newest patch first; `unassigned` games had no known patch. */
  patches: { rows: SplitRow<string>[]; unassigned: number; older: number };
  /** Positions 1–5 from parsed lanes; `unplaced` parsed games couldn't be placed. */
  positions: { rows: SplitRow<Position>[]; parsed: number; unplaced: number };
  dayParts: SplitRow<DayPart>[];
  lengths: SplitRow<LengthBand>[];
  /** Your record after winning, drawing or losing your lane (gold at 10 minutes). */
  laneOutcomes: { rows: SplitRow<LaneOutcome>[]; read: number };
  /** Allied heroes you laned with, most games first; solo lanes and roams aren't counted. */
  partners: { rows: PartnerRow[]; read: number; belowMin: number; minGames: number };
}

export { localHour } from "@/common/time/local-hour";

export function dayPartOf(hour: number): DayPart {
  if (hour >= DAY_PART_START.evening) return "evening";
  if (hour >= DAY_PART_START.afternoon) return "afternoon";
  if (hour >= DAY_PART_START.morning) return "morning";
  return "night";
}

export function lengthBandOf(durationSec: number): LengthBand {
  const min = durationSec / 60;
  if (min >= LENGTH_FROM.very_long) return "very_long";
  if (min >= LENGTH_FROM.long) return "long";
  if (min >= LENGTH_FROM.normal) return "normal";
  return "short";
}

function rows<K>(keys: readonly K[], groups: Map<K, GameResult[]>, minGames: number) {
  return keys.map((key) => ({ key, ...winRecord(groups.get(key) ?? [], minGames) }));
}

function push<K>(m: Map<K, GameResult[]>, key: K, r: GameResult) {
  const list = m.get(key);
  if (list) list.push(r);
  else m.set(key, [r]);
}

export function deeperStats(
  games: readonly SplitGame[],
  lanes: readonly SplitLane[],
  opts: {
    timeZone: string;
    rolesOf: (heroId: number) => readonly string[] | undefined;
    minGames?: number;
  },
): DeeperStats {
  const minGames = opts.minGames ?? MIN_SAMPLE;
  const byMatch = new Map(games.map((g) => [g.matchId, g]));

  // Patches, newest first by each patch's latest game.
  const patchGroups = new Map<string, GameResult[]>();
  const patchLatest = new Map<string, number>();
  let unassigned = 0;
  for (const g of games) {
    if (g.patch === null) {
      unassigned++;
      continue;
    }
    push(patchGroups, g.patch, g.result);
    patchLatest.set(g.patch, Math.max(patchLatest.get(g.patch) ?? 0, g.startedAt.getTime()));
  }
  const patchKeys = [...patchGroups.keys()].sort(
    (a, b) => (patchLatest.get(b) ?? 0) - (patchLatest.get(a) ?? 0),
  );
  const shownPatches = patchKeys.slice(0, SPLIT_PATCHES);
  const older = patchKeys
    .slice(SPLIT_PATCHES)
    .reduce((n, k) => n + (patchGroups.get(k)?.length ?? 0), 0);

  const dayGroups = new Map<DayPart, GameResult[]>();
  const lengthGroups = new Map<LengthBand, GameResult[]>();
  for (const g of games) {
    push(dayGroups, dayPartOf(localHour(g.startedAt, opts.timeZone)), g.result);
    if (Number.isFinite(g.durationSec) && g.durationSec > 0)
      push(lengthGroups, lengthBandOf(g.durationSec), g.result);
  }

  // Lanes: only parsed games we also have the result for (the imported game decides it).
  const posGroups = new Map<Position, GameResult[]>();
  const outcomeGroups = new Map<LaneOutcome, GameResult[]>();
  const partnerGroups = new Map<number, GameResult[]>();
  let parsed = 0;
  let unplaced = 0;
  let outcomesRead = 0;
  let partnersRead = 0;
  for (const l of lanes) {
    const g = byMatch.get(l.matchId);
    if (!g) continue;
    parsed++;
    const pos = positionForGame(
      { heroId: l.heroId, laneRole: l.laneRole, isRoaming: l.roaming },
      opts.rolesOf(l.heroId),
    );
    if (pos === null) unplaced++;
    else push(posGroups, pos, g.result);
    if (l.laneResult) {
      outcomesRead++;
      push(outcomeGroups, l.laneResult, g.result);
    }
    if (Array.isArray(l.lanePartnerHeroIds) && !l.roaming) {
      partnersRead++;
      for (const id of new Set(l.lanePartnerHeroIds)) push(partnerGroups, id, g.result);
    }
  }

  const partnerAll = [...partnerGroups.entries()].map(([heroId, rs]) => ({
    heroId,
    ...winRecord(rs, minGames),
  }));
  const listed = partnerAll
    .filter((p) => p.games >= MIN_PARTNER_GAMES)
    .sort(
      (a, b) => b.games - a.games || (b.winRate ?? 0) - (a.winRate ?? 0) || a.heroId - b.heroId,
    );

  return {
    overall: winRecord(
      games.map((g) => g.result),
      minGames,
    ),
    patches: { rows: rows(shownPatches, patchGroups, minGames), unassigned, older },
    positions: { rows: rows([1, 2, 3, 4, 5] as const, posGroups, minGames), parsed, unplaced },
    dayParts: rows(DAY_PARTS, dayGroups, minGames),
    lengths: rows(LENGTH_BANDS, lengthGroups, minGames),
    laneOutcomes: { rows: rows(LANE_OUTCOMES, outcomeGroups, minGames), read: outcomesRead },
    partners: {
      rows: listed.slice(0, SPLIT_PARTNERS),
      read: partnersRead,
      belowMin: partnerAll.length - listed.length,
      minGames: MIN_PARTNER_GAMES,
    },
  };
}
