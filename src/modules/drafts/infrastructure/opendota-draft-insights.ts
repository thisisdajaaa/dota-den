import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { DraftInsights } from "../application/ports";
import {
  pairKey,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type SynergyTable,
} from "../domain/draft-scoring";
import { laneKey, type LaneTable } from "../domain/draft-lanes";
import type { PositionTable } from "../domain/draft-positions";
import type { DraftMetaCache } from "./mongo-draft-meta-cache";

const HeroStatsSchema = z.array(
  z
    .object({
      id: z.number().int(),
      "6_pick": z.number().optional(),
      "6_win": z.number().optional(),
      "7_pick": z.number().optional(),
      "7_win": z.number().optional(),
      "8_pick": z.number().optional(),
      "8_win": z.number().optional(),
    })
    .passthrough(),
);

const MatchupsSchema = z.array(
  z.object({ hero_id: z.number().int(), games_played: z.number().int(), wins: z.number().int() }),
);

const ExplorerSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  err: z.unknown().optional(),
});
const count = z.coerce.number().int().nonnegative();
const ProHeroRowSchema = z.object({ hero_id: count, picks: count, bans: count, wins: count });
const LeagueRowSchema = z.object({ league: z.string().min(1), matches: count });
const PairRowSchema = z.object({ h1: count, h2: count, games: count, wins: count });
const LaneRowSchema = z.object({ h1: count, h2: count, games: count, lane_wins: count });
const PositionRowSchema = z.object({
  hero_id: count,
  pos1: count,
  pos2: count,
  pos3: count,
  pos4: count,
  pos5: count,
});

/** Default windows for the tournament queries (overridable: DRAFT_PRO_WINDOW_DAYS etc.). */
export const PRO_DAYS = 21;
export const SYNERGY_DAYS = 60;
const since = (days: number) => `extract(epoch from now() - interval '${days} days')`;

/** Pro drafts (matches with a pick/ban phase) in the window: per-hero picks, bans and wins. */
export const proHeroesSql = (days: number) =>
  `SELECT pb.hero_id, count(*) FILTER (WHERE pb.is_pick) AS picks, count(*) FILTER (WHERE NOT pb.is_pick) AS bans, count(*) FILTER (WHERE pb.is_pick AND (pb.team = 0) = m.radiant_win) AS wins FROM picks_bans pb JOIN matches m USING(match_id) WHERE m.start_time > ${since(days)} GROUP BY pb.hero_id`;
export const proLeaguesSql = (days: number) =>
  `SELECT l.name AS league, count(DISTINCT m.match_id) AS matches FROM matches m JOIN leagues l USING(leagueid) WHERE m.start_time > ${since(days)} AND EXISTS (SELECT 1 FROM picks_bans pb WHERE pb.match_id = m.match_id) GROUP BY l.name ORDER BY matches DESC`;
/** Same-team hero pairs in pro matches. */
export const proPairsSql = (days: number) =>
  `SELECT a.hero_id AS h1, b.hero_id AS h2, count(*) AS games, sum(CASE WHEN (a.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END) AS wins FROM player_matches a JOIN player_matches b ON a.match_id = b.match_id AND (a.player_slot < 128) = (b.player_slot < 128) AND a.hero_id < b.hero_id JOIN matches m ON m.match_id = a.match_id WHERE m.start_time > ${since(days)} GROUP BY 1, 2 HAVING count(*) >= 6`;

/**
 * Where heroes are played in pro matches: within each team and lane, the most gold per
 * minute is the core (safe lane pos 1, mid pos 2, off lane pos 3) and the rest support it
 * (off lane pos 4, safe lane pos 5). Jungle and unknown lanes are left out.
 */
export const proPositionsSql = (days: number) =>
  `WITH p AS (SELECT pm.hero_id, pm.lane_role, ROW_NUMBER() OVER (PARTITION BY pm.match_id, (pm.player_slot < 128), pm.lane_role ORDER BY pm.gold_per_min DESC) AS rk FROM player_matches pm JOIN matches m USING(match_id) WHERE m.start_time > ${since(days)} AND pm.lane_role IN (1, 2, 3)) SELECT hero_id, count(*) FILTER (WHERE lane_role = 1 AND rk = 1) AS pos1, count(*) FILTER (WHERE lane_role = 2 AND rk = 1) AS pos2, count(*) FILTER (WHERE lane_role = 3 AND rk = 1) AS pos3, count(*) FILTER (WHERE lane_role = 3 AND rk > 1) AS pos4, count(*) FILTER (WHERE lane_role = 1 AND rk > 1) AS pos5 FROM p GROUP BY hero_id`;

/**
 * Pro laning: heroes on opposite teams in opposing lanes (safe vs off, mid vs mid), and how
 * often h1's lane had more gold at 10 minutes than h2's. Both directions are returned.
 */
export const proLanesSql = (days: number) =>
  `WITH mm AS (SELECT match_id FROM matches WHERE start_time > ${since(days)}), p AS (SELECT pm.match_id, pm.hero_id, (pm.player_slot < 128) AS radiant, pm.lane_role, pm.gold_t[11] AS g10 FROM player_matches pm JOIN mm USING(match_id) WHERE pm.lane_role IN (1, 2, 3)), l AS (SELECT match_id, radiant, lane_role, sum(g10) AS lg FROM p GROUP BY 1, 2, 3) SELECT a.hero_id AS h1, b.hero_id AS h2, count(*) AS games, sum(CASE WHEN la.lg > lb.lg THEN 1 ELSE 0 END) AS lane_wins FROM p a JOIN p b ON a.match_id = b.match_id AND a.radiant <> b.radiant AND ((a.lane_role = 2 AND b.lane_role = 2) OR (a.lane_role = 1 AND b.lane_role = 3) OR (a.lane_role = 3 AND b.lane_role = 1)) JOIN l la ON la.match_id = a.match_id AND la.radiant = a.radiant AND la.lane_role = a.lane_role JOIN l lb ON lb.match_id = b.match_id AND lb.radiant = b.radiant AND lb.lane_role = b.lane_role WHERE a.g10 IS NOT NULL AND b.g10 IS NOT NULL GROUP BY 1, 2 HAVING count(*) >= 3`;

export const PRO_HEROES_SQL = proHeroesSql(PRO_DAYS);
export const PRO_LEAGUES_SQL = proLeaguesSql(PRO_DAYS);
export const PRO_PAIRS_SQL = proPairsSql(SYNERGY_DAYS);
export const PRO_POSITIONS_SQL = proPositionsSql(SYNERGY_DAYS);
export const PRO_LANES_SQL = proLanesSql(SYNERGY_DAYS);

/** Default freshness of a cached tournament query (DRAFT_META_FRESH_HOURS). */
export const FRESH_MS = 12 * 3_600_000;
/** Default wait for a cold tournament query before going without it (DRAFT_EXPLORER_BUDGET_MS). */
export const BUDGET_MS = 4_000;

function rowsOf<T>(body: unknown, schema: z.ZodType<T>): T[] | null {
  const parsed = ExplorerSchema.safeParse(body);
  if (!parsed.success || parsed.data.err || !parsed.data.rows) return null;
  const rows: T[] = [];
  for (const row of parsed.data.rows) {
    const r = schema.safeParse(row);
    if (r.success) rows.push(r.data);
  }
  return rows;
}

export function toProMeta(
  heroRows: unknown,
  leagueRows: unknown,
  days: number = PRO_DAYS,
): ProMeta | null {
  const heroes = rowsOf(heroRows, ProHeroRowSchema);
  const leagues = rowsOf(leagueRows, LeagueRowSchema);
  if (!heroes || !leagues) return null;
  const matches = leagues.reduce((a, l) => a + l.matches, 0);
  if (matches === 0) return null;
  return {
    matches,
    days,
    leagues: leagues.map((l) => ({ name: l.league.trim(), matches: l.matches })),
    heroes: new Map(heroes.map((h) => [h.hero_id, { picks: h.picks, bans: h.bans, wins: h.wins }])),
  };
}

export function toPositions(body: unknown): PositionTable | null {
  const rows = rowsOf(body, PositionRowSchema);
  if (!rows || rows.length === 0) return null;
  return new Map(
    rows.map((r) => {
      const counts = [r.pos1, r.pos2, r.pos3, r.pos4, r.pos5] as const;
      return [r.hero_id, { counts, games: counts.reduce((a, b) => a + b, 0) }];
    }),
  );
}

export function toLanes(body: unknown): LaneTable | null {
  const rows = rowsOf(body, LaneRowSchema);
  if (!rows || rows.length === 0) return null;
  return new Map(rows.map((r) => [laneKey(r.h1, r.h2), { games: r.games, wins: r.lane_wins }]));
}

export function toSynergy(body: unknown): SynergyTable | null {
  const rows = rowsOf(body, PairRowSchema);
  if (!rows || rows.length === 0) return null;
  return new Map(rows.map((r) => [pairKey(r.h1, r.h2), { games: r.games, wins: r.wins }]));
}

/** OpenDota public stats. Ancient, Divine and Immortal brackets (6-8) are combined. */
export class OpenDotaDraftInsights implements DraftInsights {
  private readonly now: () => number;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: {
      baseUrl: string;
      apiKey?: string;
      /** Slow SQL queries get their own gateway (longer timeout, own circuit breaker). */
      explorer?: ProviderGateway;
      cache?: DraftMetaCache;
      /** How long a request waits for a cold tournament query before going without it. */
      budgetMs?: number;
      /** Tournament window for hero picks, bans and leagues (days). */
      proDays?: number;
      /** Window for pairs, positions and lanes, which need more games (days). */
      synergyDays?: number;
      /** How long a cached tournament query counts as fresh. */
      freshMs?: number;
      now?: () => number;
    },
  ) {
    this.now = opts.now ?? Date.now;
    const pro = opts.proDays ?? PRO_DAYS;
    const syn = opts.synergyDays ?? SYNERGY_DAYS;
    this.proDays = pro;
    this.freshMs = opts.freshMs ?? FRESH_MS;
    // A non-default window gets its own cache keys, so data from another window is never used.
    const key = (base: string, days: number, fallback: number) =>
      days === fallback ? base : `${base}-${days}d`;
    this.queries = {
      heroes: [key("pro-heroes-v1", pro, PRO_DAYS), proHeroesSql(pro)],
      leagues: [key("pro-leagues-v1", pro, PRO_DAYS), proLeaguesSql(pro)],
      pairs: [key("pro-pairs-v1", syn, SYNERGY_DAYS), proPairsSql(syn)],
      positions: [key("pro-positions-v1", syn, SYNERGY_DAYS), proPositionsSql(syn)],
      lanes: [key("pro-lanes-v1", syn, SYNERGY_DAYS), proLanesSql(syn)],
    };
  }

  private readonly proDays: number;
  private readonly freshMs: number;
  private readonly queries: Record<
    "heroes" | "leagues" | "pairs" | "positions" | "lanes",
    [key: string, sql: string]
  >;

  private url(path: string): string {
    const url = new URL(`${this.opts.baseUrl}${path}`);
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  async heroMeta(): Promise<ReadonlyMap<number, HeroMeta>> {
    const res = await this.gateway.getJson(this.url("/heroStats"), { cacheTtlMs: 6 * 3_600_000 });
    if (!res.ok) return new Map();
    const parsed = HeroStatsSchema.safeParse(res.body);
    if (!parsed.success) return new Map();
    return new Map(
      parsed.data.map((h) => {
        const games = (h["6_pick"] ?? 0) + (h["7_pick"] ?? 0) + (h["8_pick"] ?? 0);
        const wins = (h["6_win"] ?? 0) + (h["7_win"] ?? 0) + (h["8_win"] ?? 0);
        return [h.id, { games, wins }];
      }),
    );
  }

  async proMeta(): Promise<ProMeta | null> {
    const [heroes, leagues] = await Promise.all([
      this.explore(...this.queries.heroes),
      this.explore(...this.queries.leagues),
    ]);
    return heroes && leagues ? toProMeta(heroes, leagues, this.proDays) : null;
  }

  async synergy(): Promise<SynergyTable | null> {
    const body = await this.explore(...this.queries.pairs);
    return body ? toSynergy(body) : null;
  }

  async positions(): Promise<PositionTable | null> {
    const body = await this.explore(...this.queries.positions);
    return body ? toPositions(body) : null;
  }

  async lanes(): Promise<LaneTable | null> {
    const body = await this.explore(...this.queries.lanes);
    return body ? toLanes(body) : null;
  }

  /** Refresh every cached tournament query now (used by the daily cron). */
  async warm(): Promise<{ key: string; ok: boolean }[]> {
    const jobs = Object.values(this.queries);
    return Promise.all(
      jobs.map(async ([key, sql]) => ({ key, ok: (await this.fetchAndStore(key, sql)) !== null })),
    );
  }

  /**
   * Cached explorer query: fresh cache is used as is; stale cache is returned at once and
   * refreshed in the background; with no cache, wait up to the budget, then go without.
   */
  private async explore(key: string, sql: string): Promise<unknown> {
    const cached = await this.opts.cache?.get(key).catch(() => null);
    if (cached && this.now() - cached.fetchedAt.getTime() < this.freshMs) return cached.body;
    const fetching = this.fetchAndStore(key, sql);
    if (cached) {
      void fetching;
      return cached.body;
    }
    const budget = this.opts.budgetMs ?? BUDGET_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), budget);
    });
    try {
      return await Promise.race([fetching, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchAndStore(key: string, sql: string): Promise<unknown> {
    const url = new URL(this.url("/explorer"));
    url.searchParams.set("sql", sql);
    const res = await (this.opts.explorer ?? this.gateway).getJson(url.toString(), {
      cacheTtlMs: this.freshMs,
    });
    if (!res.ok) return null;
    const parsed = ExplorerSchema.safeParse(res.body);
    if (!parsed.success || parsed.data.err || !parsed.data.rows) return null;
    await this.opts.cache?.put(key, res.body, new Date(this.now())).catch(() => undefined);
    return res.body;
  }

  async matchups(heroId: number): Promise<MatchupTable | null> {
    const res = await this.gateway.getJson(this.url(`/heroes/${heroId}/matchups`), {
      cacheTtlMs: 12 * 3_600_000,
    });
    if (!res.ok) return null;
    const parsed = MatchupsSchema.safeParse(res.body);
    if (!parsed.success) return null;
    return new Map(parsed.data.map((m) => [m.hero_id, { games: m.games_played, wins: m.wins }]));
  }
}
