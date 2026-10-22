import { UpstreamUnavailableError } from "@/common/errors/app-error";
import { isLeague, splitLive, type LiveGame } from "./domain/live-game";
import type { Platform } from "./domain/platform";
import { mergeStreams, type ChannelHit } from "./domain/streams";
import {
  guessStreamGames,
  matchStreams,
  searchLinks,
  type LiveStream,
  type StreamGameHint,
} from "./domain/watch";
import type { LiveSource, StreamDirectory } from "./live.ports";
import type { LiveOverview, WatchOptions } from "./dtos/responses/live.dto";
import type { WatchHubData } from "./dtos/responses/streamers.dto";

/** Stream ↔ game guesses are recomputed at most this often (both inputs are cached a minute). */
const HINTS_TTL_MS = 60_000;

export class LiveService {
  private hintsCache: { at: number; hints: Record<string, StreamGameHint> } | null = null;

  constructor(
    private readonly deps: {
      source: LiveSource;
      /** Every configured streaming site (none when no keys are set). */
      directories?: readonly StreamDirectory[];
      now?: () => number;
    },
  ) {}

  private get directories(): readonly StreamDirectory[] {
    return this.deps.directories ?? [];
  }

  /**
   * Live Dota 2 streams from every site, merged and most watched first; null only when no site
   * answered (or none is set up). One site being down still shows the others.
   */
  private async allStreams(): Promise<LiveStream[] | null> {
    const lists = await Promise.all(
      this.directories.map((d) => d.liveDotaStreams().catch(() => null)),
    );
    return lists.some((l) => l !== null) ? mergeStreams(lists) : null;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /**
   * League games (with league names) and the highest-MMR public games that someone is
   * streaming on a configured site, so every game listed can be watched. Null if the game
   * feed is unavailable; `streamsKnown` is false when no site answered (nothing is listed).
   */
  async overview(): Promise<LiveOverview | null> {
    const [games, streams] = await Promise.all([this.deps.source.games(), this.allStreams()]);
    if (!games) return null;
    const watchable = (g: LiveGame) => streams !== null && matchStreams(g, streams).length > 0;
    const { league, topPublic } = splitLive(games);
    return {
      league: await this.withLeagueNames(league.filter(watchable)),
      topPublic: topPublic.filter(watchable),
      streamsKnown: streams !== null,
    };
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
    const all = await this.allStreams();
    return { streams: all ? matchStreams(game, all) : null, links: searchLinks(game) };
  }

  /** The streaming sites that are set up (keys present), in display order. */
  get platforms(): Platform[] {
    return this.directories.map((d) => d.platform);
  }

  /**
   * The watch hub: live Dota 2 streams (most watched first) and, for streams whose titles
   * mention a live game, which game that probably is.
   */
  async hub(): Promise<WatchHubData> {
    const streams = await this.allStreams();
    if (!streams) return { streams: null, hints: {} };
    return { streams, hints: await this.hints(streams).catch(() => ({})) };
  }

  /**
   * Channels by name on every site. Throws only when no site is set up or none answers; one
   * site being down still returns the others' results.
   */
  async searchChannels(query: string, liveOnly: boolean): Promise<ChannelHit[]> {
    const lists = await Promise.all(
      this.directories.map((d) => d.searchChannels(query, liveOnly).catch(() => null)),
    );
    if (!lists.some((l) => l !== null))
      throw new UpstreamUnavailableError("Channel search is unavailable right now");
    const hits = lists.flatMap((l) => l ?? []);
    // Live channels first, keeping each site's relevance order within each group.
    return [...hits.filter((h) => h.live), ...hits.filter((h) => !h.live)];
  }

  private async hints(streams: readonly LiveStream[]) {
    const now = this.now();
    if (this.hintsCache && now - this.hintsCache.at < HINTS_TTL_MS) return this.hintsCache.hints;
    const games = await this.deps.source.games();
    if (!games) return {};
    // Only league games and games with named pros can match a title.
    const candidates = games.filter((g) => isLeague(g) || g.players.some((p) => p.isPro && p.name));
    const named = await this.withLeagueNames(candidates);
    const hints = Object.fromEntries(guessStreamGames(streams, named));
    this.hintsCache = { at: now, hints };
    return hints;
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
