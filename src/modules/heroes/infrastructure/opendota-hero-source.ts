import { z } from "zod";
import { err, ok } from "@/common/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/common/providers/provider-gateway";
import type { MatchupRow } from "../domain/hero-stats";
import type {
  HeroGameExtras,
  PlayerHeroSource,
  SourceError,
  SourceResult,
} from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";
/** Per-player hero data changes only when you play; half an hour is fresh enough. */
export const HERO_CACHE_TTL_MS = 30 * 60 * 1000;

const count = z.coerce.number().int().min(0);

/** `/players/{id}/heroes?hero_id=X`: one row per hero, counted over games where you played X. */
export const PlayerHeroRowSchema = z.object({
  hero_id: z.coerce.number().int().positive(),
  games: count,
  win: count,
  with_games: count,
  with_win: count,
  against_games: count,
  against_win: count,
});

/** `/players/{id}/matches?hero_id=X&project=…` rows. */
export const HeroMatchRowSchema = z.object({
  match_id: z.number().int().positive(),
  gold_per_min: z.number().min(0).nullable().optional(),
  xp_per_min: z.number().min(0).nullable().optional(),
  purchase: z.record(z.string(), z.number()).nullable().optional(),
  start_time: z.number().int().positive().nullable().optional(),
  duration: z.number().int().min(0).nullable().optional(),
  radiant_win: z.boolean().nullable().optional(),
  player_slot: z.number().int().min(0).max(255).nullable().optional(),
  last_hits: z.number().min(0).nullable().optional(),
  kills: z.number().min(0).nullable().optional(),
  deaths: z.number().min(0).nullable().optional(),
  assists: z.number().min(0).nullable().optional(),
});

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

/** Anti-corruption layer for OpenDota's per-player hero endpoints. */
export class OpenDotaHeroSource implements PlayerHeroSource {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { apiKey?: string; baseUrl?: string } = {},
  ) {}

  private url(path: string, params: Record<string, string | number | string[]>): string {
    const url = new URL(`${this.opts.baseUrl ?? OPENDOTA_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  async matchups(
    accountId32: number,
    heroId: number,
  ): SourceResult<{ games: number; rows: MatchupRow[] }> {
    const res = await this.gateway.getJson(
      // significant=0 counts the same games as our imported history (unbalanced ones too).
      this.url(`/players/${accountId32}/heroes`, { hero_id: heroId, significant: 0 }),
      { cacheTtlMs: HERO_CACHE_TTL_MS },
    );
    if (!res.ok) return err(toSourceError(res));
    if (!Array.isArray(res.body)) return err({ type: "invalid_payload", cause: "expected array" });
    let games = 0;
    const rows: MatchupRow[] = [];
    for (const raw of res.body) {
      const row = PlayerHeroRowSchema.safeParse(raw);
      // A malformed row is skipped, never guessed at.
      if (!row.success) continue;
      const r = row.data;
      if (r.hero_id === heroId) games = r.games;
      rows.push({
        heroId: r.hero_id,
        withGames: r.with_games,
        withWins: r.with_win,
        againstGames: r.against_games,
        againstWins: r.against_win,
      });
    }
    return ok({ games, rows });
  }

  async recentGames(
    accountId32: number,
    heroId: number,
    limit: number,
  ): SourceResult<HeroGameExtras[]> {
    const res = await this.gateway.getJson(
      this.url(`/players/${accountId32}/matches`, {
        hero_id: heroId,
        limit,
        significant: 0,
        project: [
          "gold_per_min",
          "xp_per_min",
          "purchase",
          "start_time",
          "duration",
          "radiant_win",
          "player_slot",
          "last_hits",
          "kills",
          "deaths",
          "assists",
        ],
      }),
      { cacheTtlMs: HERO_CACHE_TTL_MS },
    );
    if (!res.ok) return err(toSourceError(res));
    if (!Array.isArray(res.body)) return err({ type: "invalid_payload", cause: "expected array" });
    const games: HeroGameExtras[] = [];
    for (const raw of res.body) {
      const row = HeroMatchRowSchema.safeParse(raw);
      if (!row.success) continue;
      const r = row.data;
      games.push({
        matchId: String(r.match_id),
        goldPerMin: r.gold_per_min ?? null,
        xpPerMin: r.xp_per_min ?? null,
        purchase: r.purchase ?? null,
        startedAt: r.start_time ? new Date(r.start_time * 1000) : null,
        durationSec: r.duration ?? null,
        won:
          r.radiant_win === null || r.radiant_win === undefined || r.player_slot == null
            ? null
            : r.player_slot < 128 === r.radiant_win,
        lastHits: r.last_hits ?? null,
        kills: r.kills ?? null,
        deaths: r.deaths ?? null,
        assists: r.assists ?? null,
      });
    }
    return ok(games);
  }
}
