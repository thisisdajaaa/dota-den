import { z } from "zod";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import type { DraftInsights } from "../application/ports";
import {
  pairKey,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type SynergyTable,
} from "../domain/draft-scoring";
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

export const PRO_DAYS = 21;
export const SYNERGY_DAYS = 60;
const since = (days: number) => `extract(epoch from now() - interval '${days} days')`;

/** Pro drafts (matches with a pick/ban phase) in the window: per-hero picks, bans and wins. */
export const PRO_HEROES_SQL = `SELECT pb.hero_id, count(*) FILTER (WHERE pb.is_pick) AS picks, count(*) FILTER (WHERE NOT pb.is_pick) AS bans, count(*) FILTER (WHERE pb.is_pick AND (pb.team = 0) = m.radiant_win) AS wins FROM picks_bans pb JOIN matches m USING(match_id) WHERE m.start_time > ${since(PRO_DAYS)} GROUP BY pb.hero_id`;
export const PRO_LEAGUES_SQL = `SELECT l.name AS league, count(DISTINCT m.match_id) AS matches FROM matches m JOIN leagues l USING(leagueid) WHERE m.start_time > ${since(PRO_DAYS)} AND EXISTS (SELECT 1 FROM picks_bans pb WHERE pb.match_id = m.match_id) GROUP BY l.name ORDER BY matches DESC`;
/** Same-team hero pairs in pro matches. */
export const PRO_PAIRS_SQL = `SELECT a.hero_id AS h1, b.hero_id AS h2, count(*) AS games, sum(CASE WHEN (a.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END) AS wins FROM player_matches a JOIN player_matches b ON a.match_id = b.match_id AND (a.player_slot < 128) = (b.player_slot < 128) AND a.hero_id < b.hero_id JOIN matches m ON m.match_id = a.match_id WHERE m.start_time > ${since(SYNERGY_DAYS)} GROUP BY 1, 2 HAVING count(*) >= 6`;

const FRESH_MS = 12 * 3_600_000;

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

export function toProMeta(heroRows: unknown, leagueRows: unknown): ProMeta | null {
  const heroes = rowsOf(heroRows, ProHeroRowSchema);
  const leagues = rowsOf(leagueRows, LeagueRowSchema);
  if (!heroes || !leagues) return null;
  const matches = leagues.reduce((a, l) => a + l.matches, 0);
  if (matches === 0) return null;
  return {
    matches,
    days: PRO_DAYS,
    leagues: leagues.map((l) => ({ name: l.league.trim(), matches: l.matches })),
    heroes: new Map(heroes.map((h) => [h.hero_id, { picks: h.picks, bans: h.bans, wins: h.wins }])),
  };
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
      now?: () => number;
    },
  ) {
    this.now = opts.now ?? Date.now;
  }

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
      this.explore("pro-heroes-v1", PRO_HEROES_SQL),
      this.explore("pro-leagues-v1", PRO_LEAGUES_SQL),
    ]);
    return heroes && leagues ? toProMeta(heroes, leagues) : null;
  }

  async synergy(): Promise<SynergyTable | null> {
    const body = await this.explore("pro-pairs-v1", PRO_PAIRS_SQL);
    return body ? toSynergy(body) : null;
  }

  /** Refresh every cached tournament query now (used by the daily cron). */
  async warm(): Promise<{ key: string; ok: boolean }[]> {
    const jobs: [string, string][] = [
      ["pro-heroes-v1", PRO_HEROES_SQL],
      ["pro-leagues-v1", PRO_LEAGUES_SQL],
      ["pro-pairs-v1", PRO_PAIRS_SQL],
    ];
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
    if (cached && this.now() - cached.fetchedAt.getTime() < FRESH_MS) return cached.body;
    const fetching = this.fetchAndStore(key, sql);
    if (cached) {
      void fetching;
      return cached.body;
    }
    const budget = this.opts.budgetMs ?? 4_000;
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
      cacheTtlMs: FRESH_MS,
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
