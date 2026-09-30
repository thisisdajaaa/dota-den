import { z } from "zod";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import type { GuideSource } from "../application/guide-service";
import type { Phase, ProGame } from "../domain/hero-guide";

const HOUR = 3_600_000;
const counts = z.record(z.string(), z.number()).default({});
const PopularitySchema = z.object({
  start_game_items: counts,
  early_game_items: counts,
  mid_game_items: counts,
  late_game_items: counts,
});
const BenchSchema = z.object({
  result: z.record(z.string(), z.array(z.object({ percentile: z.number(), value: z.number() }))),
});
const MatchesSchema = z.array(
  z.object({
    match_id: z.union([z.string(), z.number()]).transform(String),
    start_time: z.number(),
    duration: z.number().optional().default(0),
    radiant_win: z.boolean().nullable().optional(),
    radiant: z.boolean().optional(),
    player_slot: z.number().optional(),
    league_name: z.string().nullable().optional(),
    account_id: z.number().nullable().optional(),
    kills: z.number().optional().default(0),
    deaths: z.number().optional().default(0),
    assists: z.number().optional().default(0),
  }),
);
const NamesSchema = z.object({
  rows: z
    .array(z.object({ account_id: z.number(), name: z.string().nullable().optional() }))
    .nullable()
    .optional(),
});

/** Guide data from OpenDota's hero endpoints, cached through the shared gateway. */
export class OpenDotaGuideSource implements GuideSource {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; apiKey?: string },
  ) {}

  private url(path: string, params: Record<string, string> = {}): string {
    const u = new URL(`${this.opts.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (this.opts.apiKey) u.searchParams.set("api_key", this.opts.apiKey);
    return u.toString();
  }

  private async get<T>(url: string, schema: z.ZodType<T>, ttl: number): Promise<T | null> {
    const res = await this.gateway.getJson(url, { cacheTtlMs: ttl });
    if (!res.ok) return null;
    const parsed = schema.safeParse(res.body);
    return parsed.success ? parsed.data : null;
  }

  async itemPopularity(heroId: number): Promise<Record<Phase, Record<string, number>> | null> {
    const d = await this.get(
      this.url(`/heroes/${heroId}/itemPopularity`),
      PopularitySchema,
      6 * HOUR,
    );
    return d
      ? {
          start: d.start_game_items,
          early: d.early_game_items,
          mid: d.mid_game_items,
          late: d.late_game_items,
        }
      : null;
  }

  async benchmarks(heroId: number) {
    const d = await this.get(
      this.url("/benchmarks", { hero_id: String(heroId) }),
      BenchSchema,
      6 * HOUR,
    );
    return d?.result ?? null;
  }

  async proGames(heroId: number): Promise<ProGame[] | null> {
    const d = await this.get(this.url(`/heroes/${heroId}/matches`), MatchesSchema, HOUR / 2);
    if (!d) return null;
    return d
      .filter((m) => m.radiant_win !== null && m.radiant_win !== undefined)
      .map((m) => {
        const radiant = m.radiant ?? (m.player_slot ?? 0) < 128;
        return {
          matchId: m.match_id,
          startedAt: new Date(m.start_time * 1000),
          durationSec: m.duration,
          leagueName: m.league_name ?? null,
          accountId32: m.account_id ?? null,
          playerName: null,
          won: radiant === m.radiant_win,
          kills: m.kills,
          deaths: m.deaths,
          assists: m.assists,
        };
      })
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /** Names of these pro players, from OpenDota's notable players (one small explorer query). */
  async proNames(accountIds: readonly number[]): Promise<Map<number, string> | null> {
    const ids = [...new Set(accountIds.filter((id) => Number.isSafeInteger(id) && id > 0))].sort(
      (a, b) => a - b,
    );
    if (ids.length === 0) return new Map();
    const sql = `SELECT account_id, name FROM notable_players WHERE account_id IN (${ids.join(",")})`;
    const d = await this.get(this.url("/explorer", { sql }), NamesSchema, 24 * HOUR);
    if (!d?.rows) return null;
    return new Map(d.rows.filter((r) => r.name).map((r) => [r.account_id, r.name!]));
  }
}
