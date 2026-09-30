import { splitLive, type LiveGame } from "../domain/live-game";

/** Where live games come from. Null means the feed is unavailable right now. */
export interface LiveSource {
  games(): Promise<LiveGame[] | null>;
  leagueName(leagueId: number): Promise<string | null>;
}

export interface LiveOverview {
  league: LiveGame[];
  topPublic: LiveGame[];
}

export class LiveService {
  constructor(private readonly deps: { source: LiveSource }) {}

  /** League games (with league names) and the highest-MMR public games; null if unavailable. */
  async overview(): Promise<LiveOverview | null> {
    const games = await this.deps.source.games();
    if (!games) return null;
    const { league, topPublic } = splitLive(games);
    return { league: await this.withLeagueNames(league), topPublic };
  }

  /** One live game; null when it isn't live (anymore) or the feed is unavailable. */
  async game(matchId: string): Promise<LiveGame | null> {
    const games = await this.deps.source.games();
    const g = games?.find((x) => x.matchId === matchId) ?? null;
    return g ? (await this.withLeagueNames([g]))[0] : null;
  }

  private async withLeagueNames(games: LiveGame[]): Promise<LiveGame[]> {
    const ids = [
      ...new Set(games.map((g) => g.leagueId).filter((id): id is number => id !== null)),
    ];
    const names = new Map(
      await Promise.all(
        ids.map(
          async (id) => [id, await this.deps.source.leagueName(id).catch(() => null)] as const,
        ),
      ),
    );
    return games.map((g) => ({
      ...g,
      leagueName: g.leagueId ? (names.get(g.leagueId) ?? null) : null,
    }));
  }
}
