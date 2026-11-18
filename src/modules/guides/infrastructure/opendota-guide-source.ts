import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { GuideSource } from "../guides.ports";
import type { MatchupRow, MatchupSource, Phase, ProGame } from "../domain/hero-guide";
import type { AbilityRef, TalentRef } from "../domain/skill-build";
import {
  WARD_EARLY_UNTIL_SEC,
  WARD_MID_UNTIL_SEC,
  type WardCell,
  type WardPhase,
} from "../domain/ward-spots";

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
const MatchupsSchema = z.array(
  z.object({
    hero_id: z.number().int().positive(),
    games_played: z.number().int().min(0),
    wins: z.number().int().min(0),
  }),
);
const SkillRowsSchema = z.object({
  rows: z.array(z.object({ ability_upgrades_arr: z.array(z.number().int()).nullable() })),
});
const WardRowsSchema = z.object({
  rows: z.array(
    z.object({
      kind: z.enum(["obs", "sen"]),
      radiant: z.boolean(),
      phase: z.coerce.number().int().min(0).max(2),
      cx: z.coerce.number(),
      cy: z.coerce.number(),
      n: z.coerce.number().int().min(0),
      games: z.coerce.number().int().min(0),
    }),
  ),
});
const HeroKeysSchema = z.record(
  z.string(),
  z.object({ id: z.number().int(), name: z.string() }).passthrough(),
);
const HeroAbilitiesSchema = z.record(
  z.string(),
  z
    .object({
      // Some heroes nest arrays here (Monkey King); keep the plain ability names only.
      abilities: z
        .array(z.unknown())
        .transform((a) => a.filter((x): x is string => typeof x === "string")),
      talents: z
        .array(z.unknown())
        .default([])
        .transform((rows) =>
          rows.flatMap((r) => {
            const t = z.object({ name: z.string(), level: z.number().int() }).safeParse(r);
            return t.success ? [t.data] : [];
          }),
        ),
    })
    .passthrough(),
);
const AbilityIdsSchema = z.record(z.string(), z.string());
const AbilitiesSchema = z.record(
  z.string(),
  z
    .object({ dname: z.string().nullable().optional(), img: z.string().nullable().optional() })
    .passthrough(),
);

/** Pro games on a hero with a recorded skill order, newest first. */
const SKILL_GAMES = 150;
const SKILL_DAYS = 90;
/** Pro games the ward map is counted from, and the map cell size (OpenDota units). */
const WARD_GAMES = 300;
const WARD_DAYS = 21;
const WARD_CELL = 4;
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";
const WARD_PHASES: readonly WardPhase[] = ["early", "mid", "late"];

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

  /** Same URL and cache as the draft engine's matchup tables. */
  async matchups(heroId: number): Promise<{ rows: MatchupRow[]; source: MatchupSource } | null> {
    const d = await this.get(this.url(`/heroes/${heroId}/matchups`), MatchupsSchema, 12 * HOUR);
    if (!d) return null;
    const rows = d.map((r) => ({ heroId: r.hero_id, games: r.games_played, wins: r.wins }));
    // OpenDota's hero matchups only count professional games.
    return { rows, source: "pro" };
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

  /** Skill orders from recent pro games on the hero, with its abilities and talents. */
  async skillBuilds(heroId: number) {
    if (!Number.isSafeInteger(heroId) || heroId < 1) return null;
    const sql = `SELECT pm.ability_upgrades_arr FROM player_matches pm JOIN matches m USING(match_id) WHERE pm.hero_id = ${heroId} AND pm.ability_upgrades_arr IS NOT NULL AND m.start_time > extract(epoch from now() - interval '${SKILL_DAYS} days') ORDER BY m.start_time DESC LIMIT ${SKILL_GAMES}`;
    const [rows, kit] = await Promise.all([
      this.get(this.url("/explorer", { sql }), SkillRowsSchema, 12 * HOUR),
      this.kit(heroId),
    ]);
    if (!rows || !kit) return null;
    const builds = rows.rows.flatMap((r) =>
      r.ability_upgrades_arr ? [r.ability_upgrades_arr] : [],
    );
    return { builds, ...kit };
  }

  /** The hero's abilities and talents with their ids, from the game-file constants. */
  private async kit(
    heroId: number,
  ): Promise<{ abilities: AbilityRef[]; talents: TalentRef[] } | null> {
    const DAY = 24 * HOUR;
    const [heroes, heroAbilities, ids, abilities] = await Promise.all([
      this.get(this.url("/constants/heroes"), HeroKeysSchema, DAY),
      this.get(this.url("/constants/hero_abilities"), HeroAbilitiesSchema, DAY),
      this.get(this.url("/constants/ability_ids"), AbilityIdsSchema, DAY),
      this.get(this.url("/constants/abilities"), AbilitiesSchema, DAY),
    ]);
    if (!heroes || !heroAbilities || !ids || !abilities) return null;
    const key = Object.values(heroes).find((h) => h.id === heroId)?.name;
    const entry = key ? heroAbilities[key] : undefined;
    if (!entry) return null;
    const idByKey = new Map<string, number>();
    for (const [id, k] of Object.entries(ids)) {
      const n = Number(id);
      if (Number.isSafeInteger(n) && !idByKey.has(k)) idByKey.set(k, n);
    }
    const abilityRefs = entry.abilities.flatMap((k): AbilityRef[] => {
      const id = idByKey.get(k);
      const a = abilities[k];
      if (id === undefined || !a?.dname) return [];
      return [{ id, name: a.dname, imageUrl: a.img ? `${STEAM_CDN}${a.img}` : null }];
    });
    const talents = entry.talents.flatMap((t): TalentRef[] => {
      const id = idByKey.get(t.name);
      const name = abilities[t.name]?.dname;
      if (id === undefined || !name || t.level < 1 || t.level > 4) return [];
      return [{ id, name, tier: t.level as TalentRef["tier"] }];
    });
    return { abilities: abilityRefs, talents };
  }

  /** Observer and sentry placements in the latest pro games, per map cell, side and phase. */
  async wardCells(): Promise<{ cells: WardCell[]; games: number } | null> {
    const sql = `WITH recent AS (SELECT match_id FROM matches WHERE start_time > extract(epoch from now() - interval '${WARD_DAYS} days') ORDER BY start_time DESC LIMIT ${WARD_GAMES}), w AS (SELECT 'obs' AS kind, pm.player_slot < 128 AS radiant, o FROM player_matches pm JOIN recent USING(match_id), unnest(pm.obs_log) o UNION ALL SELECT 'sen', pm.player_slot < 128, o FROM player_matches pm JOIN recent USING(match_id), unnest(pm.sen_log) o) SELECT kind, radiant, CASE WHEN (o->>'time')::int < ${WARD_EARLY_UNTIL_SEC} THEN 0 WHEN (o->>'time')::int < ${WARD_MID_UNTIL_SEC} THEN 1 ELSE 2 END AS phase, round((o->>'x')::float / ${WARD_CELL}) * ${WARD_CELL} AS cx, round((o->>'y')::float / ${WARD_CELL}) * ${WARD_CELL} AS cy, count(*) AS n, (SELECT count(*) FROM recent) AS games FROM w GROUP BY 1, 2, 3, 4, 5 HAVING count(*) >= 3`;
    const d = await this.get(this.url("/explorer", { sql }), WardRowsSchema, 12 * HOUR);
    if (!d || d.rows.length === 0) return null;
    return {
      games: d.rows[0].games,
      cells: d.rows.map((r) => ({
        kind: r.kind === "obs" ? "observer" : "sentry",
        side: r.radiant ? "radiant" : "dire",
        phase: WARD_PHASES[r.phase],
        x: r.cx,
        y: r.cy,
        count: r.n,
      })),
    };
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
