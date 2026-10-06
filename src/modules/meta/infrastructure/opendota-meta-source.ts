import { z } from "zod";
import { err, ok, type Result } from "@/common/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/common/providers/provider-gateway";
import type { DuoRow } from "../domain/lane-duos";
import type { HeroPublicStats, LaneStats, ProDrafts, WinCount } from "../domain/meta-stats";
import type { LaneGame } from "../domain/position";
import type {
  Fetched,
  MetaStatsSource,
  PlayerLaneHistory,
  SourceError,
  SourceResult,
} from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";

const HOUR = 3_600_000;
export const TTL = {
  heroStats: 6 * HOUR,
  laneRoles: 24 * HOUR,
  proDrafts: 6 * HOUR,
  /** The duo query takes ~12s upstream; refresh twice a day at most. */
  proLaneDuos: 12 * HOUR,
  playerLanes: HOUR,
} as const;
/** When a refresh fails, keep serving the last good value for up to this long. */
export const STALE_GRACE_MS = 48 * HOUR;

const MEMO_PRUNE_AT = 1_000;

export const PRO_DRAFT_DAYS = 21;
export const PRO_DUO_DAYS = 60;
export const PLAYER_LANE_DAYS = 60;

export const PRO_DRAFTS_SQL = `SELECT pb.hero_id, count(*) FILTER (WHERE pb.is_pick) AS picks, count(*) FILTER (WHERE NOT pb.is_pick) AS bans, count(DISTINCT m.leagueid) AS leagues, (SELECT count(DISTINCT pb2.match_id) FROM picks_bans pb2 JOIN matches m2 USING(match_id) WHERE m2.start_time > extract(epoch from now() - interval '${PRO_DRAFT_DAYS} days')) AS drafts FROM picks_bans pb JOIN matches m USING(match_id) WHERE m.start_time > extract(epoch from now() - interval '${PRO_DRAFT_DAYS} days') GROUP BY pb.hero_id ORDER BY count(*) DESC`;

export const PRO_DUOS_SQL = `SELECT a.hero_id h1, b.hero_id h2, a.lane_role, count(*) games, sum(CASE WHEN (a.player_slot<128)=m.radiant_win THEN 1 ELSE 0 END) wins FROM player_matches a JOIN player_matches b ON a.match_id=b.match_id AND a.lane=b.lane AND (a.player_slot<128)=(b.player_slot<128) AND a.hero_id<b.hero_id JOIN matches m ON m.match_id=a.match_id WHERE m.start_time > extract(epoch from now() - interval '${PRO_DUO_DAYS} days') GROUP BY 1,2,3 HAVING count(*)>=8 ORDER BY games DESC LIMIT 200`;

// Postgres counts (bigint) may arrive as strings; accept both, reject anything else.
const count = z.coerce.number().int().min(0);
const trend = z.array(z.number().min(0)).optional();

export const HeroStatsSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    "6_pick": z.number().min(0).optional(),
    "6_win": z.number().min(0).optional(),
    "7_pick": z.number().min(0).optional(),
    "7_win": z.number().min(0).optional(),
    "8_pick": z.number().min(0).optional(),
    "8_win": z.number().min(0).optional(),
    pub_pick_trend: trend,
  }),
);

export const LaneRolesSchema = z.array(
  z.object({
    hero_id: z.number().int(),
    lane_role: z.number().int().min(0).max(5),
    games: count,
    wins: count,
  }),
);

/** Explorer responses: `{rows, err}`. A non-empty `err` is a failed query. */
export function explorerSchema<T extends z.ZodType>(row: T) {
  return z.object({
    rows: z.array(row).nullable().optional(),
    err: z
      .union([z.string(), z.object({}).passthrough()])
      .nullable()
      .optional(),
  });
}

export const ProDraftRowSchema = z.object({
  hero_id: z.number().int().positive(),
  picks: count,
  bans: count,
  leagues: count,
  drafts: count,
});

export const DuoRowSchema = z.object({
  h1: z.number().int().positive(),
  h2: z.number().int().positive(),
  lane_role: z.number().int().nullable(),
  games: count,
  wins: count,
});

const PlayerLaneRowSchema = z.object({
  hero_id: z.number().int().min(0),
  lane_role: z.number().int().nullable().optional(),
  is_roaming: z.boolean().nullable().optional(),
  // Always returned by the match list, whatever is projected.
  player_slot: z.number().int().min(0).max(255).nullable().optional(),
  radiant_win: z.boolean().nullable().optional(),
});

/** Win or loss from the player's slot and the winning side; null when either is missing. */
function resultOf(
  slot: number | null | undefined,
  radiantWin: boolean | null | undefined,
): "win" | "loss" | null {
  if (slot === null || slot === undefined || radiantWin === null || radiantWin === undefined)
    return null;
  return slot < 128 === radiantWin ? "win" : "loss";
}

/** A usable explorer answer: rows and no error (a failed query must not be cached). */
export function explorerOk(body: unknown): boolean {
  const parsed = explorerSchema(z.unknown()).safeParse(body);
  if (!parsed.success || !parsed.data.rows) return false;
  const e = parsed.data.err;
  return !e || (typeof e === "string" && e.trim() === "");
}

/** Parse an explorer body; `err` or a malformed row fails the whole result. */
export function parseExplorer<T extends z.ZodType>(
  body: unknown,
  row: T,
): Result<z.infer<T>[], SourceError> {
  const parsed = explorerSchema(row).safeParse(body);
  if (!parsed.success) return err({ type: "invalid_payload", cause: "explorer shape" });
  const e = parsed.data.err;
  if (e && (typeof e !== "string" || e.trim() !== ""))
    return err({ type: "unavailable", cause: "explorer query error" });
  if (!parsed.data.rows) return err({ type: "invalid_payload", cause: "explorer rows" });
  return ok(parsed.data.rows as z.infer<T>[]);
}

function toSourceError(res: Exclude<GatewayResponse, { ok: true }>): SourceError {
  switch (res.kind) {
    case "not_found":
      return { type: "not_found" };
    case "rate_limited":
      return { type: "rate_limited", retryAfterMs: res.retryAfterMs };
    case "circuit_open":
      return { type: "unavailable", cause: "circuit_open" };
    case "failed":
      return { type: "unavailable", cause: res.cause };
  }
}

interface MemoEntry {
  value: unknown;
  fetchedAt: Date;
  expiresAt: number;
}

/**
 * OpenDota meta data: public hero stats, lane-role scenarios, pro explorer queries and a
 * player's recent lanes. Results are kept in memory with their fetch time; when a refresh
 * fails, the last good value is served for up to 48h (and its age is shown).
 */
export class OpenDotaMetaSource implements MetaStatsSource, PlayerLaneHistory {
  private readonly memo = new Map<string, MemoEntry>();
  private readonly inFlight = new Map<string, Promise<Result<Fetched<unknown>, SourceError>>>();

  constructor(
    private readonly gateways: { api: ProviderGateway; explorer: ProviderGateway },
    private readonly opts: { baseUrl?: string; apiKey?: string; now?: () => Date } = {},
  ) {}

  private now(): Date {
    return (this.opts.now ?? (() => new Date()))();
  }

  private url(path: string, params: Record<string, string | number | string[]> = {}): string {
    const url = new URL(`${this.opts.baseUrl ?? OPENDOTA_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  private async cached<T>(
    key: string,
    ttlMs: number,
    /** `stamp` reports when cached upstream data was really fetched (else: now). */
    load: (stamp: (at: Date | null) => void) => Promise<Result<T, SourceError>>,
  ): SourceResult<T> {
    const now = this.now();
    const hit = this.memo.get(key);
    if (hit && hit.expiresAt > now.getTime())
      return ok({ value: hit.value as T, fetchedAt: hit.fetchedAt });

    const pending = this.inFlight.get(key);
    if (pending) return pending as SourceResult<T>;

    const run = (async (): Promise<Result<Fetched<unknown>, SourceError>> => {
      let upstreamAt: Date | null = null;
      const res = await load((at) => (upstreamAt = at));
      if (res.ok) {
        const fetchedAt = upstreamAt ?? this.now();
        this.prune(fetchedAt.getTime());
        this.memo.set(key, { value: res.value, fetchedAt, expiresAt: fetchedAt.getTime() + ttlMs });
        return ok({ value: res.value, fetchedAt });
      }
      const stale = this.memo.get(key);
      if (stale && this.now().getTime() - stale.fetchedAt.getTime() < STALE_GRACE_MS)
        return ok({ value: stale.value, fetchedAt: stale.fetchedAt });
      return res;
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run as SourceResult<T>;
  }

  /** Per-player entries would otherwise pile up; drop anything past its stale grace. */
  private prune(now: number): void {
    if (this.memo.size < MEMO_PRUNE_AT) return;
    for (const [key, entry] of this.memo)
      if (now - entry.fetchedAt.getTime() >= STALE_GRACE_MS || entry.expiresAt <= now)
        this.memo.delete(key);
  }

  private async getJson(
    gateway: ProviderGateway,
    url: string,
    shared?: {
      ttlMs: number;
      cacheIf: (body: unknown) => boolean;
      stamp: (at: Date | null) => void;
    },
  ): Promise<Result<unknown, SourceError>> {
    const res = await gateway.getJson(
      url,
      shared ? { cacheTtlMs: shared.ttlMs, cacheIf: shared.cacheIf } : {},
    );
    if (res.ok && shared) shared.stamp(res.fetchedAt ? new Date(res.fetchedAt) : null);
    return res.ok ? ok(res.body) : err(toSourceError(res));
  }

  heroStats(): SourceResult<HeroPublicStats[]> {
    return this.cached("heroStats", TTL.heroStats, async () => {
      const res = await this.getJson(this.gateways.api, this.url("/heroStats"));
      if (!res.ok) return res;
      const parsed = HeroStatsSchema.safeParse(res.value);
      if (!parsed.success) return err({ type: "invalid_payload", cause: "heroStats" });
      return ok(
        parsed.data.map((h) => ({
          heroId: h.id,
          // Ancient (6), Divine (7) and Immortal (8) combined.
          games: (h["6_pick"] ?? 0) + (h["7_pick"] ?? 0) + (h["8_pick"] ?? 0),
          wins: (h["6_win"] ?? 0) + (h["7_win"] ?? 0) + (h["8_win"] ?? 0),
          pickTrend: h.pub_pick_trend ?? [],
        })),
      );
    });
  }

  laneRoles(heroId: number): SourceResult<LaneStats> {
    return this.cached(`laneRoles:${heroId}`, TTL.laneRoles, async () => {
      const res = await this.getJson(
        this.gateways.api,
        this.url("/scenarios/laneRoles", { hero_id: heroId }),
      );
      if (!res.ok) return res;
      const parsed = LaneRolesSchema.safeParse(res.value);
      if (!parsed.success) return err({ type: "invalid_payload", cause: "laneRoles" });
      // Rows are split by game-length bucket; add them up per lane role.
      const lanes = new Map<number, WinCount>();
      for (const r of parsed.data) {
        if (r.hero_id !== heroId || r.wins > r.games) continue;
        const cur = lanes.get(r.lane_role) ?? { games: 0, wins: 0 };
        lanes.set(r.lane_role, { games: cur.games + r.games, wins: cur.wins + r.wins });
      }
      return ok(lanes as LaneStats);
    });
  }

  proDrafts(): SourceResult<ProDrafts> {
    return this.cached("proDrafts", TTL.proDrafts, async (stamp) => {
      const res = await this.getJson(
        this.gateways.explorer,
        this.url("/explorer", { sql: PRO_DRAFTS_SQL }),
        // Slow queries: share good results across servers (Redis) for twice the TTL.
        { ttlMs: 2 * TTL.proDrafts, cacheIf: explorerOk, stamp },
      );
      if (!res.ok) return res;
      const rows = parseExplorer(res.value, ProDraftRowSchema);
      if (!rows.ok) return rows;
      return ok({
        drafts: rows.value.reduce((n, r) => Math.max(n, r.drafts), 0),
        windowDays: PRO_DRAFT_DAYS,
        heroes: rows.value.map((r) => ({
          heroId: r.hero_id,
          picks: r.picks,
          bans: r.bans,
          leagues: r.leagues,
        })),
      });
    });
  }

  proLaneDuos(): SourceResult<{ windowDays: number; rows: DuoRow[] }> {
    return this.cached("proLaneDuos", TTL.proLaneDuos, async (stamp) => {
      const res = await this.getJson(
        this.gateways.explorer,
        this.url("/explorer", { sql: PRO_DUOS_SQL }),
        // Slow queries: share good results across servers (Redis) for twice the TTL.
        { ttlMs: 2 * TTL.proLaneDuos, cacheIf: explorerOk, stamp },
      );
      if (!res.ok) return res;
      const rows = parseExplorer(res.value, DuoRowSchema);
      if (!rows.ok) return rows;
      return ok({
        windowDays: PRO_DUO_DAYS,
        rows: rows.value
          .filter((r) => r.lane_role !== null && r.wins <= r.games)
          .map((r) => ({
            heroA: r.h1,
            heroB: r.h2,
            laneRole: r.lane_role!,
            games: r.games,
            wins: r.wins,
          })),
      });
    });
  }

  recentLanes(accountId32: number): SourceResult<{ windowDays: number; games: LaneGame[] }> {
    return this.cached(`playerLanes:${accountId32}`, TTL.playerLanes, async () => {
      const res = await this.getJson(
        this.gateways.api,
        this.url(`/players/${accountId32}/matches`, {
          date: PLAYER_LANE_DAYS,
          limit: 100,
          project: ["hero_id", "lane_role", "is_roaming"],
        }),
      );
      if (!res.ok) return res;
      if (!Array.isArray(res.value))
        return err({ type: "invalid_payload", cause: "expected array" });
      const games: LaneGame[] = [];
      for (const raw of res.value) {
        const row = PlayerLaneRowSchema.safeParse(raw);
        if (!row.success) continue;
        games.push({
          heroId: row.data.hero_id,
          laneRole: row.data.lane_role ?? null,
          isRoaming: row.data.is_roaming ?? null,
          result: resultOf(row.data.player_slot, row.data.radiant_win),
        });
      }
      return ok({ windowDays: PLAYER_LANE_DAYS, games });
    });
  }
}
