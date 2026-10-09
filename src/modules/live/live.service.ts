import { splitLive, type LiveGame } from "./domain/live-game";
import { matchStreams, searchLinks } from "./domain/watch";
import type { LiveSource, StreamSource } from "./live.ports";
import type { LiveOverview, WatchOptions } from "./dtos/responses/live.dto";

export class LiveService {
  constructor(private readonly deps: { source: LiveSource; streams?: StreamSource | null }) {}

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

  /**
   * The live game each of these accounts is in (account → match id), from the feed's player
   * lists. Empty when none is live or the feed is unavailable. Public games appear in the
   * feed only for players who expose their match data, so a missing account proves nothing.
   */
  async liveMatchIds(accountIds: readonly number[]): Promise<Map<number, string>> {
    const found = new Map<number, string>();
    if (accountIds.length === 0) return found;
    const wanted = new Set(accountIds);
    const games = (await this.deps.source.games()) ?? [];
    for (const g of games)
      for (const p of g.players)
        if (p.accountId32 !== null && wanted.has(p.accountId32) && !found.has(p.accountId32))
          found.set(p.accountId32, g.matchId);
    return found;
  }

  /** Where to watch a game: matching streams to embed (when configured) and search links. */
  async watch(game: LiveGame): Promise<WatchOptions> {
    const all = this.deps.streams ? await this.deps.streams.dotaStreams().catch(() => null) : null;
    return { streams: all ? matchStreams(game, all) : null, links: searchLinks(game) };
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
