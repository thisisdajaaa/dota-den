/**
 * Rank brackets for the Meta page: which medals a bracket covers, how the URL names it, and
 * how a hero does in it. The four groupings are STRATZ's basic brackets (the same ones How you
 * compare uses); the default, Ancient–Immortal, is the high-rank view the page always showed.
 * Win and pick counts per medal come from OpenDota's public hero stats (rank tiers 1–8).
 */
import { bracketOf } from "@/modules/heroes/domain/compare";
import { shrunkRate, type HeroPublicStats, type RankedHero, type WinCount } from "./meta-stats";

/** OpenDota's medal numbers: 1 Herald … 8 Immortal. */
export type Medal = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const MEDALS: readonly Medal[] = [1, 2, 3, 4, 5, 6, 7, 8];
export const MEDAL_NAMES: Record<Medal, string> = {
  1: "Herald",
  2: "Guardian",
  3: "Crusader",
  4: "Archon",
  5: "Legend",
  6: "Ancient",
  7: "Divine",
  8: "Immortal",
};

/** Brackets a player can pick, lowest first; `ancient-immortal` is the page's default. */
export const META_BRACKETS = [
  "herald-guardian",
  "crusader-archon",
  "legend-ancient",
  "divine-immortal",
  "ancient-immortal",
] as const;
export type MetaBracket = (typeof META_BRACKETS)[number];

/** The view everyone saw before brackets: Ancient, Divine and Immortal, placed by STRATZ. */
export const DEFAULT_BRACKET: MetaBracket = "ancient-immortal";

export const BRACKET_MEDALS: Record<MetaBracket, readonly Medal[]> = {
  "herald-guardian": [1, 2],
  "crusader-archon": [3, 4],
  "legend-ancient": [5, 6],
  "divine-immortal": [7, 8],
  "ancient-immortal": [6, 7, 8],
};

/** "Herald–Guardian": medal names are the game's own, the same in every language. */
export function bracketLabel(bracket: MetaBracket): string {
  const medals = BRACKET_MEDALS[bracket];
  return `${MEDAL_NAMES[medals[0]]}–${MEDAL_NAMES[medals[medals.length - 1]]}`;
}

/** `?bracket=` from the URL, or null when it's missing or not a bracket. */
export function parseBracket(value: string | string[] | undefined): MetaBracket | null {
  if (typeof value !== "string") return null;
  return (META_BRACKETS as readonly string[]).includes(value) ? (value as MetaBracket) : null;
}

/** The bracket of a rank medal (OpenDota rank tier 11–80); null when unranked or unknown. */
export function bracketForRankTier(rankTier: number | null | undefined): MetaBracket | null {
  if (!rankTier || !Number.isInteger(rankTier) || rankTier < 11 || rankTier > 80) return null;
  switch (bracketOf(rankTier)) {
    case "HERALD_GUARDIAN":
      return "herald-guardian";
    case "CRUSADER_ARCHON":
      return "crusader-archon";
    case "LEGEND_ANCIENT":
      return "legend-ancient";
    case "DIVINE_IMMORTAL":
      return "divine-immortal";
    default:
      return null;
  }
}

export interface BracketChoice {
  bracket: MetaBracket;
  /** "url": picked in the link; "yours": the viewer's own rank; "default": neither. */
  reason: "url" | "yours" | "default";
  /** The viewer's own bracket, when we know their rank. */
  yours: MetaBracket | null;
}

/**
 * Which bracket to show: the one in the URL, else the signed-in viewer's own (from their rank
 * medal), else the default. An unknown rank never guesses a bracket.
 */
export function chooseBracket(
  param: string | string[] | undefined,
  viewerRankTier: number | null | undefined,
): BracketChoice {
  const yours = bracketForRankTier(viewerRankTier);
  const picked = parseBracket(param);
  if (picked) return { bracket: picked, reason: "url", yours };
  if (yours) return { bracket: yours, reason: "yours", yours };
  return { bracket: DEFAULT_BRACKET, reason: "default", yours };
}

/** The Meta page's URL for a position (or none) and bracket; the bracket only when given. */
export function metaUrl(position: number | null, bracket: MetaBracket | null): string {
  const params = new URLSearchParams();
  if (position !== null) params.set("pos", String(position));
  if (bracket) params.set("bracket", bracket);
  const qs = params.toString();
  return qs ? `/meta?${qs}` : "/meta";
}

/**
 * A hero needs this many games in the bracket to be ranked there. The smallest bracket
 * (Herald–Guardian) still has about 1,800 games on its least-played hero in OpenDota's sample,
 * so this only drops heroes the sample barely saw (±1.6 points of standard error at 1,000).
 */
export const MIN_BRACKET_GAMES = 1_000;
/** Virtual games at 50% that small bracket samples are pulled toward (as for high ranks). */
export const BRACKET_PRIOR_GAMES = 1_000;

export interface BracketStats {
  bracket: MetaBracket;
  /** Games and wins per hero in the bracket (all positions). */
  heroes: ReadonlyMap<number, WinCount>;
  /** Matches in the bracket: every hero's picks over 10 players a match. */
  matches: number;
  /** Medals of the bracket with no games at all in the data (OpenDota often has no Immortal). */
  emptyMedals: readonly Medal[];
}

/** Every hero's record in a bracket, from per-medal counts. Missing counts are not filled in. */
export function bracketStats(
  heroes: readonly HeroPublicStats[],
  bracket: MetaBracket,
): BracketStats {
  const medals = BRACKET_MEDALS[bracket];
  const out = new Map<number, WinCount>();
  const perMedal = new Map<Medal, number>(medals.map((m) => [m, 0]));
  let picks = 0;
  for (const h of heroes) {
    let games = 0;
    let wins = 0;
    for (const m of medals) {
      const c = h.medals?.[m];
      if (!c || c.games <= 0 || c.wins > c.games) continue;
      games += c.games;
      wins += c.wins;
      perMedal.set(m, perMedal.get(m)! + c.games);
    }
    picks += games;
    if (games > 0) out.set(h.heroId, { games, wins });
  }
  return {
    bracket,
    heroes: out,
    matches: Math.round(picks / 10),
    emptyMedals: medals.filter((m) => perMedal.get(m) === 0),
  };
}

/** The bracket's records in the shape the lane-based candidate picker reads. */
export function asPublicStats(stats: BracketStats): Map<number, HeroPublicStats> {
  return new Map([...stats.heroes].map(([heroId, c]) => [heroId, { heroId, ...c, pickTrend: [] }]));
}

/**
 * Re-rank a position's heroes by how they do in a bracket. `placed` is the position's usual
 * ranking, which decides who plays the position (STRATZ position shares, or lane data); only
 * the order changes: by the bracket win rate, pulled toward 50% for small samples. Heroes with
 * fewer than MIN_BRACKET_GAMES in the bracket are left out. Tournament data doesn't count
 * here (pros say little about a Herald game) and isn't shown with the hero; the pick trend
 * (all public games) is kept as a label but doesn't move the order.
 */
export function rankInBracket(placed: readonly RankedHero[], stats: BracketStats): RankedHero[] {
  const out: RankedHero[] = [];
  for (const h of placed) {
    const c = stats.heroes.get(h.heroId);
    if (!c || c.games < MIN_BRACKET_GAMES) continue;
    const adjusted = shrunkRate(c.wins, c.games, BRACKET_PRIOR_GAMES);
    out.push({
      ...h,
      score: adjusted - 0.5,
      // The high-rank record is a different bracket; never shown next to this one.
      highRank: null,
      pro: null,
      bracket: {
        bracket: stats.bracket,
        games: c.games,
        wins: c.wins,
        rate: c.wins / c.games,
        adjusted,
        pickRate: stats.matches > 0 ? Math.min(1, c.games / stats.matches) : null,
      },
    });
  }
  return out.sort((a, b) => b.score - a.score || a.heroId - b.heroId);
}
