import type { LiveGame } from "./live-game";
import { channelKey, type Platform } from "./platform";

/** A live Dota 2 stream as a streaming site reports it. */
export interface LiveStream {
  platform: Platform;
  /** Channel login (Twitch) or slug (Kick), used for the embed. */
  channel: string;
  displayName: string;
  title: string;
  viewers: number;
  language: string;
  /** The site's user id (stable when a channel renames). */
  userId?: string;
  /** Preview image, possibly a template with `{width}` and `{height}` placeholders. */
  thumbnailUrl?: string | null;
  avatarUrl?: string | null;
  /** ISO time the stream went live. */
  startedAt?: string | null;
  /** What the channel is playing (search and follow lookups cover every category). */
  gameName?: string | null;
}

export interface StreamMatch extends LiveStream {
  /** The game's names the stream title mentions (teams, league, pro players). */
  mentions: string[];
}

export interface SearchLink {
  site: "Twitch" | "YouTube";
  label: string;
  href: string;
}

const MAX_MATCHES = 5;

/** Common prefixes and suffixes streams drop from team names ("Team Spirit" → "Spirit"). */
function variants(name: string): string[] {
  const short = name
    .replace(/^team\s+/i, "")
    .replace(/\s+(gaming|esports?|team)$/i, "")
    .trim();
  return [...new Set([name.trim(), short])].filter((v) => v.length >= 2);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive: "OG" matches "OG vs Spirit" but not "blog". */
function wordPattern(term: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu");
}

/** One name a title can mention, compiled once per game. */
interface Term {
  name: string;
  /** The name as given. */
  full: RegExp;
  /**
   * Shortened forms ("Spirit" for "Team Spirit"). They can be ordinary words or hero names
   * ("Storm Spirit mid"), so on their own they don't link a stream: see `linked`.
   */
  short: RegExp[];
}

/** The names a stream title may use for this game: teams, the league, and its pros. */
function gameTerms(game: LiveGame): Term[] {
  const strong = [
    ...(game.teams.radiant ? [game.teams.radiant] : []),
    ...(game.teams.dire ? [game.teams.dire] : []),
    ...(game.leagueName ? [game.leagueName] : []),
  ];
  const pros = game.players.filter((p) => p.isPro && p.name).map((p) => p.name!.trim());
  return [...strong, ...pros]
    .filter((t) => t.length >= 2)
    .map((name) => ({
      name,
      full: wordPattern(name.trim()),
      short: variants(name)
        .filter((v) => v !== name.trim())
        .map(wordPattern),
    }));
}

/**
 * The names a title mentions, but only when that's a real link: a name written in full, or
 * at least two different names ("Spirit vs Falcons"). A lone shortened name isn't enough.
 */
function mentionsOf(title: string, terms: readonly Term[]): string[] {
  let full = false;
  const found: string[] = [];
  for (const t of terms) {
    if (t.full.test(title)) {
      full = true;
      found.push(t.name);
    } else if (t.short.some((p) => p.test(title))) found.push(t.name);
  }
  return full || found.length >= 2 ? found : [];
}

/**
 * Streams whose titles mention this game. There's no feed linking a match to a channel, so
 * this is a title match, and the UI says so. A stream counts when its title names a team or
 * the league (league games), or at least one of the pros playing (any game). Best first:
 * more mentions, then more viewers.
 */
export function matchStreams(game: LiveGame, streams: readonly LiveStream[]): StreamMatch[] {
  const terms = gameTerms(game);
  if (terms.length === 0) return [];
  const matched: StreamMatch[] = [];
  for (const s of streams) {
    const found = mentionsOf(s.title, terms);
    if (found.length > 0) matched.push({ ...s, mentions: found });
  }
  return matched
    .sort((a, b) => b.mentions.length - a.mentions.length || b.viewers - a.viewers)
    .slice(0, MAX_MATCHES);
}

/** The live game a stream's title points to, as a guess (see `matchStreams`). */
export interface StreamGameHint {
  matchId: string;
  radiant: string | null;
  dire: string | null;
  leagueName: string | null;
  /** The names the title mentions. */
  mentions: string[];
}

/**
 * The reverse of `matchStreams`: for each stream, the live game its title mentions most
 * (ties go to the game more people are spectating), keyed by `channelKey(platform, channel)`.
 * Streams that mention no game are left out.
 */
export function guessStreamGames(
  streams: readonly LiveStream[],
  games: readonly LiveGame[],
): Map<string, StreamGameHint> {
  const compiled = games
    .map((game) => ({ game, terms: gameTerms(game) }))
    .filter((g) => g.terms.length > 0);
  const hints = new Map<string, StreamGameHint>();
  for (const s of streams) {
    let best: { game: LiveGame; mentions: string[] } | null = null;
    for (const { game, terms } of compiled) {
      const mentions = mentionsOf(s.title, terms);
      if (mentions.length === 0) continue;
      if (
        !best ||
        mentions.length > best.mentions.length ||
        (mentions.length === best.mentions.length && game.spectators > best.game.spectators)
      )
        best = { game, mentions };
    }
    if (best)
      hints.set(channelKey(s.platform, s.channel), {
        matchId: best.game.matchId,
        radiant: best.game.teams.radiant,
        dire: best.game.teams.dire,
        leagueName: best.game.leagueName,
        mentions: best.mentions,
      });
  }
  return hints;
}

/** Searches that work without any keys: the teams (or pros) and the league. */
export function searchLinks(game: LiveGame): SearchLink[] {
  const { radiant, dire } = game.teams;
  const pros = game.players.filter((p) => p.isPro && p.name).map((p) => p.name!);
  const query =
    radiant && dire
      ? `${radiant} vs ${dire}`
      : (game.leagueName ?? (pros.length > 0 ? pros.slice(0, 2).join(" ") : null));
  if (!query) return [];
  const q = encodeURIComponent(query);
  const links: SearchLink[] = [
    {
      site: "Twitch",
      label: `Search Twitch for “${query}”`,
      href: `https://www.twitch.tv/search?term=${q}`,
    },
    {
      site: "YouTube",
      label: `Search YouTube live for “${query}”`,
      // sp=EgJAAQ%3D%3D is YouTube's "Live" filter.
      href: `https://www.youtube.com/results?search_query=${q}&sp=EgJAAQ%253D%253D`,
    },
  ];
  if (game.leagueName && query !== game.leagueName) {
    links.push({
      site: "Twitch",
      label: `Search Twitch for “${game.leagueName}”`,
      href: `https://www.twitch.tv/search?term=${encodeURIComponent(game.leagueName)}`,
    });
  }
  return links;
}
