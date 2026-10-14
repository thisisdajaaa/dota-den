/** Read models and catalog types of the matches feature, shared with other features (pure). */

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

export interface PlayerProfileSnapshot {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
  /**
   * `limited` when the upstream reports full history unavailable (often a Steam privacy
   * setting); matches it learned from other players may still appear.
   */
  matchHistory: "full" | "limited" | "unknown";
  rankTier: number | null;
  /** Valve's Immortal leaderboard position for the player's region, when listed. */
  leaderboardRank: number | null;
}

/** Read models for Match Intelligence (query side). */
export interface RankedResultRow {
  matchId: string;
  startedAt: Date;
  heroId: number;
  result: "win" | "loss";
  queueClass: "solo" | "party" | "unknown";
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface HeroInfo {
  id: number;
  name: string;
  /** null when upstream gives an unexpected image path (never render untrusted hosts). */
  imageUrl: string | null;
  iconUrl: string | null;
  /** Large transparent hero render for banners. */
  renderUrl: string | null;
  roles: string[];
  attackType: "Melee" | "Ranged" | null;
  primaryAttr: "str" | "agi" | "int" | "all" | null;
}

export type DashboardRange = "all" | "patch" | "30d";

export type DashboardMode = "all" | "ranked";

export interface DashboardFilter {
  range: DashboardRange;
  mode: DashboardMode;
}

/** Row shape for dashboard read models. */
export interface DashboardFact {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  side: "radiant" | "dire";
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  queueClass: "solo" | "party" | "unknown";
  partySize: number | null;
  patch: string | null;
  patchCertainty: "confident" | "boundary" | "unknown";
}

export interface DashboardFacts {
  facts: DashboardFact[];
  /** Patch of the most recent imported match; the "current patch" filter uses it. */
  latestPatch: string | null;
}

/** Filters for matchups from your own games. */
export interface LineupFilter {
  range: "all" | "patch" | "90d" | "30d";
  mode: DashboardMode;
  /** Only games where you played this hero. */
  heroId?: number;
}

/** One of your games with both lineups (null lineups: the upstream gave none). */
export interface LineupFact {
  matchId: string;
  heroId: number;
  result: "win" | "loss";
  allyHeroIds: number[] | null;
  enemyHeroIds: number[] | null;
}

export interface LineupFacts {
  games: LineupFact[];
  latestPatch: string | null;
}

/** How many of your imported games have lineups yet (the lineup backfill's progress). */
export interface LineupCoverage {
  /** All your imported games. */
  total: number;
  /** Of those, games stored with both lineups. */
  withLineups: number;
  /** Older games still waiting to be re-read for their lineups. */
  pending: number;
  /** The backfill has walked your whole history (any games left have no lineup upstream). */
  complete: boolean;
}

export interface ItemInfo {
  id: number;
  /** Internal item name ("black_king_bar"), as used in purchase logs. */
  key: string;
  name: string;
  imageUrl: string | null;
  /** Upstream item class ("consumable", "component", "epic", …), when given. */
  qual: string | null;
  /** Gold cost, when given. */
  cost: number | null;
}
