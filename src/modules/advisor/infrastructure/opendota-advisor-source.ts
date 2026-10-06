import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { MatchupTable, PoolRow } from "../domain/pool-advice";

const HOUR = 3_600_000;
const n = z.coerce.number().int().min(0).catch(0);
const HeroRows = z.array(
  z.object({
    hero_id: z.coerce.number().int().positive(),
    games: n,
    win: n,
    against_games: n,
    against_win: n,
  }),
);
const Matchups = z.array(
  z.object({ hero_id: z.coerce.number().int().positive(), games_played: n, wins: n }),
);

/** Your recent hero records and hero matchup tables from OpenDota. */
export class OpenDotaAdvisorSource {
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

  async poolRows(accountId32: number, days: number): Promise<PoolRow[] | null> {
    const res = await this.gateway.getJson(
      this.url(`/players/${accountId32}/heroes`, { date: String(days) }),
      { cacheTtlMs: HOUR },
    );
    if (!res.ok) return null;
    const parsed = HeroRows.safeParse(res.body);
    if (!parsed.success) return null;
    return parsed.data.map((r) => ({
      heroId: r.hero_id,
      games: r.games,
      wins: Math.min(r.win, r.games),
      againstGames: r.against_games,
      againstWins: Math.min(r.against_win, r.against_games),
    }));
  }

  /** Same URL and cache as the draft engine's matchup tables. */
  async matchups(heroId: number): Promise<MatchupTable | null> {
    const res = await this.gateway.getJson(this.url(`/heroes/${heroId}/matchups`), {
      cacheTtlMs: 12 * HOUR,
    });
    if (!res.ok) return null;
    const parsed = Matchups.safeParse(res.body);
    if (!parsed.success) return null;
    return new Map(
      parsed.data.map((r) => [
        r.hero_id,
        { games: r.games_played, wins: Math.min(r.wins, r.games_played) },
      ]),
    );
  }
}
