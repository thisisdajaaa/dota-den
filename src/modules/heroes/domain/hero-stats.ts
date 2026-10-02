/**
 * Your record on one hero: pure summaries over your own games and OpenDota's per-player
 * counts. Every number comes from counted games; nothing is estimated or filled in, and
 * anything below its minimum sample is flagged or left out, never shown as a finding.
 */

/** Same bar as the rest of the app: below this many games a win rate is only indicative. */
export const MIN_SAMPLE = 10;
/** A matchup needs this many games against (or with) a hero before it's listed. */
export const MIN_MATCHUP_GAMES = 5;
/** Items are only summarised when at least this many games have purchase data. */
export const MIN_ITEM_GAMES = 5;
/** Trend buckets shown (the most recent ones). */
export const MAX_TREND_BUCKETS = 12;
/** Share of games that must have a known patch before the trend is split by patch. */
export const MIN_PATCH_SHARE = 0.8;

export type GameResult = "win" | "loss";

export interface WinRecord {
  games: number;
  wins: number;
  losses: number;
  /** null when there are no games; never a made-up 0%. */
  winRate: number | null;
  lowSample: boolean;
}

export function winRecord(results: readonly GameResult[], minGames = MIN_SAMPLE): WinRecord {
  const wins = results.filter((r) => r === "win").length;
  const games = results.length;
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games === 0 ? null : wins / games,
    lowSample: games < minGames,
  };
}

/** One of your games on a hero, from the imported match history. */
export interface HeroGame {
  matchId: string;
  heroId: number;
  startedAt: Date;
  result: GameResult;
  kills: number;
  deaths: number;
  assists: number;
  /** Patch in effect when the game started; null when unknown. */
  patch: string | null;
}

export interface HeroRecord extends WinRecord {
  /** (kills + assists) / deaths over all games; null with no games. */
  kda: number | null;
  averages: { kills: number; deaths: number; assists: number } | null;
  lastPlayed: Date | null;
}

export function heroRecord(games: readonly HeroGame[]): HeroRecord {
  const n = games.length;
  const sum = (k: "kills" | "deaths" | "assists") => games.reduce((acc, g) => acc + g[k], 0);
  const last = games.reduce<Date | null>(
    (latest, g) => (latest === null || g.startedAt > latest ? g.startedAt : latest),
    null,
  );
  return {
    ...winRecord(games.map((g) => g.result)),
    kda: n === 0 ? null : (sum("kills") + sum("assists")) / Math.max(1, sum("deaths")),
    averages:
      n === 0
        ? null
        : { kills: sum("kills") / n, deaths: sum("deaths") / n, assists: sum("assists") / n },
    lastPlayed: last,
  };
}

export interface HeroIndexRow extends HeroRecord {
  heroId: number;
}

/** Every hero you've played, most played first (ties: most recent, then hero id). */
export function heroIndex(games: readonly HeroGame[]): HeroIndexRow[] {
  const byHero = new Map<number, HeroGame[]>();
  for (const g of games) byHero.set(g.heroId, [...(byHero.get(g.heroId) ?? []), g]);
  return [...byHero.entries()]
    .map(([heroId, gs]) => ({ heroId, ...heroRecord(gs) }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        (b.lastPlayed?.getTime() ?? 0) - (a.lastPlayed?.getTime() ?? 0) ||
        a.heroId - b.heroId,
    );
}

export interface TrendBucket extends WinRecord {
  /** Patch name ("7.41") or month key ("2026-09"). */
  key: string;
  /** "7.41" or "Sep 2026". */
  label: string;
}

export interface WinRateTrend {
  by: "patch" | "month";
  /** Oldest first; at most `maxBuckets`, the most recent ones. */
  buckets: TrendBucket[];
  /** Games left out because their patch is unknown (patch trends only). */
  unassigned: number;
  /** Games in older buckets beyond the ones shown. */
  older: number;
}

/** "2026-09" in the given time zone (falls back to UTC for an unknown zone). */
export function monthKey(date: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/**
 * Win rate over time. Split by patch when the patch is known for most games
 * (MIN_PATCH_SHARE) and they span at least two patches; otherwise by calendar month.
 * Buckets are ordered by their first game, oldest first.
 */
export function winRateTrend(
  games: readonly HeroGame[],
  opts: { timeZone: string; maxBuckets?: number; minPatchShare?: number },
): WinRateTrend {
  const maxBuckets = opts.maxBuckets ?? MAX_TREND_BUCKETS;
  const withPatch = games.filter((g) => g.patch !== null);
  const patches = new Set(withPatch.map((g) => g.patch));
  const byPatch =
    games.length > 0 &&
    withPatch.length / games.length >= (opts.minPatchShare ?? MIN_PATCH_SHARE) &&
    patches.size >= 2;

  const sorted = [...(byPatch ? withPatch : games)].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
  );
  const groups = new Map<string, GameResult[]>();
  for (const g of sorted) {
    const key = byPatch ? g.patch! : monthKey(g.startedAt, opts.timeZone);
    groups.set(key, [...(groups.get(key) ?? []), g.result]);
  }
  const all = [...groups.entries()].map(([key, results]) => ({
    key,
    label: byPatch ? key : monthLabel(key),
    ...winRecord(results),
  }));
  const buckets = all.slice(-maxBuckets);
  return {
    by: byPatch ? "patch" : "month",
    buckets,
    unassigned: byPatch ? games.length - withPatch.length : 0,
    older: all.slice(0, all.length - buckets.length).reduce((n, b) => n + b.games, 0),
  };
}

/** OpenDota's per-hero counts for games where you played the hero in question. */
export interface MatchupRow {
  heroId: number;
  withGames: number;
  withWins: number;
  againstGames: number;
  againstWins: number;
}

export interface MatchupEntry {
  heroId: number;
  games: number;
  wins: number;
  winRate: number;
}

export interface Matchups {
  /** Enemy heroes you win against most (win rate 50% or better), best first. */
  beats: MatchupEntry[];
  /** Enemy heroes you lose to most (under 50%), worst first. */
  losesTo: MatchupEntry[];
  /** Allied heroes you win with (50% or better), best first. */
  allies: MatchupEntry[];
  /** Enemy / allied heroes seen, but in too few games to list. */
  enemiesBelowMin: number;
  alliesBelowMin: number;
  minGames: number;
}

function entry(heroId: number, games: number, wins: number): MatchupEntry {
  return { heroId, games, wins, winRate: wins / games };
}

/**
 * Best and worst matchups on a hero. Heroes under `minGames` are left out (and counted); ties
 * break by more games, then hero id. A hero is never both a "beats" and a "loses to".
 */
export function matchups(
  rows: readonly MatchupRow[],
  selfHeroId: number,
  opts: { minGames?: number; limit?: number } = {},
): Matchups {
  const minGames = opts.minGames ?? MIN_MATCHUP_GAMES;
  const limit = opts.limit ?? 5;
  const others = rows.filter((r) => r.heroId !== selfHeroId);
  const valid = (games: number, wins: number) => games > 0 && wins >= 0 && wins <= games;

  const enemies = others
    .filter((r) => valid(r.againstGames, r.againstWins))
    .map((r) => entry(r.heroId, r.againstGames, r.againstWins));
  const allies = others
    .filter((r) => valid(r.withGames, r.withWins))
    .map((r) => entry(r.heroId, r.withGames, r.withWins));
  const enough = (e: MatchupEntry) => e.games >= minGames;
  const desc = (a: MatchupEntry, b: MatchupEntry) =>
    b.winRate - a.winRate || b.games - a.games || a.heroId - b.heroId;
  const asc = (a: MatchupEntry, b: MatchupEntry) =>
    a.winRate - b.winRate || b.games - a.games || a.heroId - b.heroId;

  const listedEnemies = enemies.filter(enough);
  const listedAllies = allies.filter(enough);
  return {
    beats: listedEnemies
      .filter((e) => e.winRate >= 0.5)
      .sort(desc)
      .slice(0, limit),
    losesTo: listedEnemies
      .filter((e) => e.winRate < 0.5)
      .sort(asc)
      .slice(0, limit),
    allies: listedAllies
      .filter((e) => e.winRate >= 0.5)
      .sort(desc)
      .slice(0, limit),
    enemiesBelowMin: enemies.length - listedEnemies.length,
    alliesBelowMin: allies.length - listedAllies.length,
    minGames,
  };
}

/** Item facts needed to decide what's worth listing. */
export interface ItemMeta {
  key: string;
  qual: string | null;
  cost: number | null;
}

/** Components cheaper than this are building blocks, not purchases worth listing. */
export const NOTABLE_COMPONENT_COST = 2000;

/** Leaves out recipes, consumables and cheap components (boots, gloves, …). */
export function isNotableItem(item: ItemMeta): boolean {
  if (item.key.startsWith("recipe_")) return false;
  if (item.qual === "consumable") return false;
  if (item.qual === "component") return (item.cost ?? 0) >= NOTABLE_COMPONENT_COST;
  return true;
}

export interface ItemShare {
  key: string;
  /** Games (with purchase data) in which you bought it at least once. */
  games: number;
  share: number;
}

export interface ItemSummary {
  /** Games looked at. */
  sample: number;
  /** Of those, games with purchase data (parsed replays). */
  withData: number;
  /** false when `withData` is under the minimum: `items` is then empty. */
  enough: boolean;
  items: ItemShare[];
  /** Share of games with purchase data in which you bought each notable item (all of them). */
  shares: Record<string, number>;
}

/**
 * Your most-bought items: in how many of your games with purchase data you bought each
 * notable item at least once. Unknown item keys are left out, never guessed.
 */
export function itemPurchases(
  games: ReadonlyArray<{ purchase: Readonly<Record<string, number>> | null }>,
  isNotable: (key: string) => boolean,
  opts: { minGames?: number; limit?: number } = {},
): ItemSummary {
  const minGames = opts.minGames ?? MIN_ITEM_GAMES;
  const withData = games.filter((g) => g.purchase !== null);
  const counts = new Map<string, number>();
  for (const g of withData) {
    for (const [key, n] of Object.entries(g.purchase!)) {
      if (!(n > 0) || !isNotable(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const enough = withData.length >= minGames;
  return {
    sample: games.length,
    withData: withData.length,
    enough,
    shares: enough
      ? Object.fromEntries([...counts.entries()].map(([key, n]) => [key, n / withData.length]))
      : {},
    items: enough
      ? [...counts.entries()]
          .map(([key, n]) => ({ key, games: n, share: n / withData.length }))
          .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key))
          .slice(0, opts.limit ?? 8)
      : [],
  };
}

/** Mean of the known values, with how many there were; null when none are known. */
export function averageOf(
  values: ReadonlyArray<number | null>,
): { average: number; games: number } | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (known.length === 0) return null;
  return { average: known.reduce((a, b) => a + b, 0) / known.length, games: known.length };
}

export interface HighRankComparison {
  publicGames: number;
  publicWins: number;
  publicRate: number;
  /** Your win rate minus the public one; null when your sample is too small to compare. */
  delta: number | null;
}

/** Your win rate next to public high-rank games on the same hero. null without public data. */
export function highRankComparison(
  yours: WinRecord,
  publicStats: { games: number; wins: number } | null,
): HighRankComparison | null {
  if (!publicStats || publicStats.games <= 0 || publicStats.wins > publicStats.games) return null;
  const publicRate = publicStats.wins / publicStats.games;
  return {
    publicGames: publicStats.games,
    publicWins: publicStats.wins,
    publicRate,
    delta: yours.winRate === null || yours.lowSample ? null : yours.winRate - publicRate,
  };
}
