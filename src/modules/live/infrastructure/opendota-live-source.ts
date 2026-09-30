import { z } from "zod";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import type { LiveSource } from "../application/live-service";
import type { LiveGame } from "../domain/live-game";

const num = z.coerce.number();
const LiveSchema = z.array(
  z
    .object({
      match_id: z.union([z.string(), z.number()]).transform(String),
      league_id: num.optional().nullable(),
      team_name_radiant: z.string().nullable().optional(),
      team_name_dire: z.string().nullable().optional(),
      radiant_score: num.optional(),
      dire_score: num.optional(),
      radiant_lead: num.optional(),
      game_time: num.optional(),
      delay: num.optional(),
      average_mmr: num.optional().nullable(),
      spectators: num.optional(),
      last_update_time: num.optional(),
      players: z
        .array(
          z
            .object({
              account_id: num.optional().nullable(),
              name: z.string().nullable().optional(),
              hero_id: num.optional(),
              team: num.optional(),
              is_pro: z.boolean().nullable().optional(),
            })
            .passthrough(),
        )
        .default([]),
    })
    .passthrough(),
);
const LeagueSchema = z.object({ name: z.string().nullable().optional() }).passthrough();

/** Live games from OpenDota's spectator feed, with league names looked up (cached a day). */
export class OpenDotaLiveSource implements LiveSource {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; apiKey?: string },
  ) {}

  private url(path: string): string {
    const u = new URL(`${this.opts.baseUrl}${path}`);
    if (this.opts.apiKey) u.searchParams.set("api_key", this.opts.apiKey);
    return u.toString();
  }

  async games(): Promise<LiveGame[] | null> {
    const res = await this.gateway.getJson(this.url("/live"), { cacheTtlMs: 20_000 });
    if (!res.ok) return null;
    const parsed = LiveSchema.safeParse(res.body);
    if (!parsed.success) return null;
    return parsed.data.map((g) => ({
      matchId: g.match_id,
      leagueId: g.league_id ? g.league_id : null,
      leagueName: null,
      teams: { radiant: g.team_name_radiant || null, dire: g.team_name_dire || null },
      score: { radiant: g.radiant_score ?? 0, dire: g.dire_score ?? 0 },
      radiantLead: g.radiant_lead ?? 0,
      gameTimeSec: g.game_time ?? 0,
      delaySec: g.delay ?? 0,
      averageMmr: g.average_mmr ? g.average_mmr : null,
      spectators: g.spectators ?? 0,
      players: g.players.map((p) => ({
        accountId32: p.account_id ? p.account_id : null,
        name: p.name ?? null,
        heroId: p.hero_id ?? 0,
        side: p.team === 1 ? ("dire" as const) : ("radiant" as const),
        isPro: p.is_pro === true,
      })),
      updatedAt: new Date((g.last_update_time ?? 0) * 1000),
    }));
  }

  async leagueName(leagueId: number): Promise<string | null> {
    const res = await this.gateway.getJson(this.url(`/leagues/${leagueId}`), {
      cacheTtlMs: 24 * 3_600_000,
    });
    if (!res.ok) return null;
    const parsed = LeagueSchema.safeParse(res.body);
    return parsed.success ? (parsed.data.name ?? null) : null;
  }
}
