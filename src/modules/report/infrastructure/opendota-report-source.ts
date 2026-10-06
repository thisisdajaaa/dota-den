import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import type { ReportGame } from "../domain/battle-report";

const FIELDS = [
  "start_time",
  "duration",
  "hero_id",
  "player_slot",
  "radiant_win",
  "kills",
  "deaths",
  "assists",
  "gold_per_min",
  "xp_per_min",
  "last_hits",
  "denies",
  "hero_damage",
  "hero_healing",
  "tower_damage",
  "lane_role",
  "version",
];
const num = z.number().nullable().optional();
const Row = z.object({
  match_id: z.union([z.number(), z.string()]).transform(String),
  start_time: z.number(),
  duration: z.number().nullable().optional(),
  hero_id: z.number(),
  player_slot: z.number().nullable().optional(),
  radiant_win: z.boolean().nullable().optional(),
  kills: num,
  deaths: num,
  assists: num,
  gold_per_min: num,
  xp_per_min: num,
  last_hits: num,
  denies: num,
  hero_damage: num,
  hero_healing: num,
  tower_damage: num,
  lane_role: num,
  version: num,
});

/** A player's games over the last `days` days with the stats the report needs (cached 1h). */
export async function reportGames(
  gateway: ProviderGateway,
  opts: { baseUrl: string; apiKey?: string },
  accountId32: number,
  days: number,
): Promise<ReportGame[] | null> {
  const u = new URL(`${opts.baseUrl}/players/${accountId32}/matches`);
  u.searchParams.set("date", String(days));
  u.searchParams.set("significant", "0");
  for (const f of FIELDS) u.searchParams.append("project", f);
  if (opts.apiKey) u.searchParams.set("api_key", opts.apiKey);
  const res = await gateway.getJson(u.toString(), { cacheTtlMs: 3_600_000 });
  if (!res.ok || !Array.isArray(res.body)) return null;
  const out: ReportGame[] = [];
  for (const raw of res.body) {
    const p = Row.safeParse(raw);
    // A game without a result or side can't count as a win or a loss.
    if (!p.success || p.data.radiant_win == null || p.data.player_slot == null) continue;
    const r = p.data;
    const side = r.player_slot! < 128 ? "radiant" : "dire";
    out.push({
      matchId: r.match_id,
      startedAt: new Date(r.start_time * 1000),
      durationSec: r.duration ?? 0,
      heroId: r.hero_id,
      side,
      won: (side === "radiant") === r.radiant_win,
      kills: r.kills ?? 0,
      deaths: r.deaths ?? 0,
      assists: r.assists ?? 0,
      goldPerMin: r.gold_per_min ?? null,
      xpPerMin: r.xp_per_min ?? null,
      lastHits: r.last_hits ?? null,
      denies: r.denies ?? null,
      heroDamage: r.hero_damage ?? null,
      heroHealing: r.hero_healing ?? null,
      towerDamage: r.tower_damage ?? null,
      laneRole: r.lane_role ?? null,
      parsed: r.version != null,
    });
  }
  return out;
}
