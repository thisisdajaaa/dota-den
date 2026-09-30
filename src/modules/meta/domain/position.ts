/**
 * Dota positions 1–5 and how we read them from match data.
 *
 * OpenDota's `lane_role` (from parsed replays) is 1 safe lane, 2 mid, 3 off lane, 4 jungle.
 * A lane role alone can't tell a safe-lane carry from the support next to it, so we use the
 * hero's roles from the hero catalog to split cores from supports in the same lane.
 */
export type Position = 1 | 2 | 3 | 4 | 5;
export type LaneRole = 1 | 2 | 3 | 4;

export const POSITIONS: readonly Position[] = [1, 2, 3, 4, 5];

export interface PositionInfo {
  position: Position;
  /** "Pos 1". */
  short: string;
  /** "Safe lane carry". */
  name: string;
  /** The lane role (OpenDota `lane_role`) this position plays in the laning stage. */
  laneRole: 1 | 2 | 3;
  laneName: "safe lane" | "mid lane" | "off lane";
  side: "core" | "support";
}

export const POSITION_INFO: Record<Position, PositionInfo> = {
  1: {
    position: 1,
    short: "Pos 1",
    name: "Safe lane carry",
    laneRole: 1,
    laneName: "safe lane",
    side: "core",
  },
  2: { position: 2, short: "Pos 2", name: "Mid", laneRole: 2, laneName: "mid lane", side: "core" },
  3: {
    position: 3,
    short: "Pos 3",
    name: "Offlaner",
    laneRole: 3,
    laneName: "off lane",
    side: "core",
  },
  4: {
    position: 4,
    short: "Pos 4",
    name: "Soft support",
    laneRole: 3,
    laneName: "off lane",
    side: "support",
  },
  5: {
    position: 5,
    short: "Pos 5",
    name: "Hard support",
    laneRole: 1,
    laneName: "safe lane",
    side: "support",
  },
};

export function parsePosition(value: unknown): Position | null {
  if (typeof value !== "string" || !/^[1-5]$/.test(value)) return null;
  return Number(value) as Position;
}

/**
 * A hero counts as a support when the catalog tags it "Support" and either not "Carry" or
 * lists Support first. Heroes tagged Carry first (e.g. Wraith King, Kunkka) count as cores.
 */
export function isSupportHero(roles: readonly string[]): boolean {
  return roles.includes("Support") && (!roles.includes("Carry") || roles[0] === "Support");
}

export interface LaneGame {
  heroId: number;
  /** null when the match wasn't parsed (OpenDota only knows lanes for parsed replays). */
  laneRole: number | null;
  isRoaming: boolean | null;
  /** The player's result, when the row says which side won. */
  result?: "win" | "loss" | null;
}

/**
 * Position for one game, or null when the data can't tell (no lane info, unknown hero,
 * a core in the jungle).
 */
export function positionForGame(
  game: LaneGame,
  heroRoles: readonly string[] | undefined,
): Position | null {
  if (game.laneRole === 2) return 2;
  if (!heroRoles) return null;
  const support = isSupportHero(heroRoles);
  if (game.isRoaming === true && support) return 4;
  switch (game.laneRole) {
    case 1:
      return support ? 5 : 1;
    case 3:
      return support ? 4 : 3;
    case 4:
      return support ? 4 : null;
    default:
      return null;
  }
}

export interface RoleDerivation {
  /** Most-played position, or null when fewer than `minGames` games could be read. */
  position: Position | null;
  /** Games whose position could be read. */
  counted: number;
  /** Games with no usable lane info. */
  skipped: number;
  byPosition: Record<Position, number>;
}

export const MIN_ROLE_GAMES = 5;

/** Most-played position over the given games. Ties go to the lower position number. */
export function deriveRole(
  games: readonly LaneGame[],
  rolesOf: (heroId: number) => readonly string[] | undefined,
  minGames = MIN_ROLE_GAMES,
): RoleDerivation {
  const byPosition: Record<Position, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let counted = 0;
  for (const g of games) {
    const pos = positionForGame(g, rolesOf(g.heroId));
    if (pos === null) continue;
    byPosition[pos]++;
    counted++;
  }
  let best: Position | null = null;
  for (const p of POSITIONS)
    if (byPosition[p] > 0 && (best === null || byPosition[p] > byPosition[best])) best = p;
  return {
    position: counted >= minGames ? best : null,
    counted,
    skipped: games.length - counted,
    byPosition,
  };
}

export interface PositionRecord {
  position: Position;
  games: number;
  /** Games in this position whose result is known (the win rate's denominator). */
  decided: number;
  wins: number;
  /** null when no game in this position has a known result. */
  winRate: number | null;
  lowSample: boolean;
  /** Heroes played in this position, most played first. */
  heroes: Array<{ heroId: number; games: number; wins: number; decided: number }>;
}

export interface PositionBreakdown {
  /** Every game in the sample. */
  total: number;
  /** Games whose position could be read. */
  counted: number;
  /** Games with no lane data at all (usually unparsed replays). */
  noLaneData: number;
  /** Games with lane data we still couldn't place (unknown hero, a core in the jungle). */
  unplaced: number;
  /** Positions 1–5 in order, including ones with no games. */
  positions: PositionRecord[];
}

/** Below this many games in a position, its win rate is shown but flagged as a low sample. */
export const MIN_POSITION_GAMES = 10;

/**
 * Where the player actually plays and how they do there: games and win rate per position,
 * using the same per-game reading as {@link deriveRole}. Nothing is guessed: games whose
 * position can't be read are counted separately, by reason.
 */
export function positionBreakdown(
  games: readonly LaneGame[],
  rolesOf: (heroId: number) => readonly string[] | undefined,
  minGames = MIN_POSITION_GAMES,
): PositionBreakdown {
  type Tally = { games: number; wins: number; decided: number };
  const acc = new Map<Position, Map<number, Tally>>(POSITIONS.map((p) => [p, new Map()]));
  let noLaneData = 0;
  let unplaced = 0;
  for (const g of games) {
    if (g.laneRole === null) {
      noLaneData++;
      continue;
    }
    const pos = positionForGame(g, rolesOf(g.heroId));
    if (pos === null) {
      unplaced++;
      continue;
    }
    const heroes = acc.get(pos)!;
    const h = heroes.get(g.heroId) ?? { games: 0, wins: 0, decided: 0 };
    h.games++;
    if (g.result === "win" || g.result === "loss") h.decided++;
    if (g.result === "win") h.wins++;
    heroes.set(g.heroId, h);
  }
  const positions = POSITIONS.map((position): PositionRecord => {
    const heroes = [...acc.get(position)!.entries()]
      .map(([heroId, h]) => ({ heroId, ...h }))
      .sort((a, b) => b.games - a.games || a.heroId - b.heroId);
    const count = (k: keyof Tally) => heroes.reduce((n, h) => n + h[k], 0);
    const decided = count("decided");
    const wins = count("wins");
    return {
      position,
      games: count("games"),
      decided,
      wins,
      winRate: decided > 0 ? wins / decided : null,
      lowSample: decided < minGames,
      heroes,
    };
  });
  return {
    total: games.length,
    counted: games.length - noLaneData - unplaced,
    noLaneData,
    unplaced,
    positions,
  };
}
