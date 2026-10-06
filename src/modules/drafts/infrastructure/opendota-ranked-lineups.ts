import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { RankedLineup } from "../drafts.ports";

const Row = z.object({
  match_id: z.union([z.number(), z.string()]).transform(String),
  player_slot: z.number().nullable().optional(),
  radiant_win: z.boolean().nullable().optional(),
  heroes: z
    .record(z.string(), z.object({ hero_id: z.number().nullable().optional() }))
    .nullable()
    .optional(),
});

/** A player's recent ranked games with both lineups (one OpenDota call, cached 30 minutes). */
export async function rankedLineups(
  gateway: ProviderGateway,
  opts: { baseUrl: string; apiKey?: string },
  accountId32: number,
  limit: number,
): Promise<RankedLineup[] | null> {
  const u = new URL(`${opts.baseUrl}/players/${accountId32}/matches`);
  u.searchParams.set("lobby_type", "7");
  u.searchParams.set("limit", String(limit));
  for (const f of ["heroes", "radiant_win", "player_slot"]) u.searchParams.append("project", f);
  if (opts.apiKey) u.searchParams.set("api_key", opts.apiKey);
  const res = await gateway.getJson(u.toString(), { cacheTtlMs: 30 * 60_000 });
  if (!res.ok || !Array.isArray(res.body)) return null;
  const out: RankedLineup[] = [];
  for (const raw of res.body) {
    const p = Row.safeParse(raw);
    if (!p.success || p.data.radiant_win == null || p.data.player_slot == null || !p.data.heroes)
      continue;
    const radiant: number[] = [];
    const dire: number[] = [];
    for (const [slot, h] of Object.entries(p.data.heroes)) {
      if (!h.hero_id) continue;
      (Number(slot) < 128 ? radiant : dire).push(h.hero_id);
    }
    // Only full 5v5 lineups can be graded.
    if (radiant.length !== 5 || dire.length !== 5) continue;
    const yourSide = p.data.player_slot < 128 ? "radiant" : "dire";
    out.push({
      matchId: p.data.match_id,
      yourSide,
      won: (yourSide === "radiant") === p.data.radiant_win,
      radiant,
      dire,
    });
  }
  return out;
}
