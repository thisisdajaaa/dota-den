/**
 * Live games (pure), as OpenDota reports them from the game's own spectator feed. League
 * games are shown with the broadcast delay the game applies (usually 15 minutes).
 */
/** Which team a player is on. */
export type Side = "radiant" | "dire";

export interface LivePlayer {
  accountId32: number | null;
  name: string | null;
  heroId: number;
  side: Side;
  isPro: boolean;
}

export interface LiveGame {
  matchId: string;
  leagueId: number | null;
  leagueName: string | null;
  teams: Record<Side, string | null>;
  score: Record<Side, number>;
  /** Radiant's net worth lead (negative: Dire leads). */
  radiantLead: number;
  /** In-game clock of the delayed feed, in seconds. */
  gameTimeSec: number;
  /** Broadcast delay the feed is behind by, in seconds. */
  delaySec: number;
  /** Average MMR the game reports for public matches (0 for leagues). */
  averageMmr: number | null;
  spectators: number;
  players: LivePlayer[];
  updatedAt: Date;
}

export const isLeague = (g: LiveGame) => g.leagueId !== null;

/** Heroes picked on a side, in slot order (0 while still drafting). */
export function sideHeroes(g: LiveGame, side: Side): number[] {
  return g.players.filter((p) => p.side === side && p.heroId > 0).map((p) => p.heroId);
}

/** Every hero picked on both sides: the draft is done and can be analysed. */
export const draftComplete = (g: LiveGame) =>
  sideHeroes(g, "radiant").length === 5 && sideHeroes(g, "dire").length === 5;

/** League games (most watched first), and the highest-MMR public games. */
export function splitLive(
  games: readonly LiveGame[],
  topPublic = 6,
): {
  league: LiveGame[];
  topPublic: LiveGame[];
} {
  return {
    league: games.filter(isLeague).sort((a, b) => b.spectators - a.spectators),
    topPublic: games
      .filter((g) => !isLeague(g) && (g.averageMmr ?? 0) > 0)
      .sort((a, b) => (b.averageMmr ?? 0) - (a.averageMmr ?? 0))
      .slice(0, topPublic),
  };
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Dire leads by 34.3k gold" / "Even". */
export function leadText(g: LiveGame): string {
  if (Math.abs(g.radiantLead) < 500) return "Net worth even";
  const who = g.radiantLead > 0 ? "Radiant" : "Dire";
  return `${who} leads by ${(Math.abs(g.radiantLead) / 1000).toFixed(1)}k gold`;
}
