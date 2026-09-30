import type { LiveGame } from "./live-game";

/** A live Dota 2 stream as a streaming site reports it. */
export interface LiveStream {
  /** Channel login, used for the embed. */
  channel: string;
  displayName: string;
  title: string;
  viewers: number;
  language: string;
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
function mentions(title: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu").test(title);
}

/**
 * Streams whose titles mention this game. There's no feed linking a match to a channel, so
 * this is a title match, and the UI says so. A stream counts when its title names a team or
 * the league (league games), or at least one of the pros playing (any game). Best first:
 * more mentions, then more viewers.
 */
export function matchStreams(game: LiveGame, streams: readonly LiveStream[]): StreamMatch[] {
  const strong = [
    ...(game.teams.radiant ? [game.teams.radiant] : []),
    ...(game.teams.dire ? [game.teams.dire] : []),
    ...(game.leagueName ? [game.leagueName] : []),
  ];
  const pros = game.players.filter((p) => p.isPro && p.name).map((p) => p.name!.trim());
  const terms = [...strong, ...pros].filter((t) => t.length >= 2);

  const matched: StreamMatch[] = [];
  for (const s of streams) {
    const found = terms.filter((t) => variants(t).some((v) => mentions(s.title, v)));
    if (found.length > 0) matched.push({ ...s, mentions: found });
  }
  return matched
    .sort((a, b) => b.mentions.length - a.mentions.length || b.viewers - a.viewers)
    .slice(0, MAX_MATCHES);
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
