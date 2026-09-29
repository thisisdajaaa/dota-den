import { z } from "zod";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import type { DraftInsights } from "../application/ports";
import type { HeroMeta, MatchupTable } from "../domain/draft-scoring";

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

/** OpenDota public stats. Ancient, Divine and Immortal brackets (6-8) are combined. */
export class OpenDotaDraftInsights implements DraftInsights {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; apiKey?: string },
  ) {}

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
