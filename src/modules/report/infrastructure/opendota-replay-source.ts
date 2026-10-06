import { z } from "zod";
import type { ProviderGateway } from "@/common/providers/provider-gateway";
import { replaySummary, type ReplayPlayer, type ReplaySummary } from "../domain/replay-summary";

const n = z.number().nullable().optional();
const Detail = z.object({
  players: z.array(
    z.object({
      player_slot: z.number(),
      account_id: n,
      lane: n,
      is_roaming: z.boolean().nullable().optional(),
      gold_t: z.array(z.number()).nullable().optional(),
      roshan_kills: n,
      camps_stacked: n,
      observer_kills: n,
      sentry_kills: n,
      runes: z.record(z.string(), z.number()).nullable().optional(),
    }),
  ),
});

/**
 * One parsed match's lane outcome and objectives for the player (one OpenDota call, cached a
 * day). Null when the match can't be read or the player isn't in it.
 */
export async function readReplay(
  gateway: ProviderGateway,
  opts: { baseUrl: string; apiKey?: string },
  matchId: string,
  accountId32: number,
): Promise<ReplaySummary | null> {
  const u = new URL(`${opts.baseUrl}/matches/${matchId}`);
  if (opts.apiKey) u.searchParams.set("api_key", opts.apiKey);
  const res = await gateway.getJson(u.toString(), { cacheTtlMs: 24 * 3_600_000 });
  if (!res.ok) return null;
  const parsed = Detail.safeParse(res.body);
  if (!parsed.success) return null;
  const players: Array<ReplayPlayer & { accountId: number | null }> = parsed.data.players.map(
    (p) => ({
      accountId: p.account_id ?? null,
      playerSlot: p.player_slot,
      lane: p.lane ?? null,
      roaming: p.is_roaming === true,
      goldAt10: p.gold_t && p.gold_t.length > 10 ? p.gold_t[10] : null,
      roshanKills: p.roshan_kills ?? 0,
      campsStacked: p.camps_stacked ?? 0,
      dewards: (p.observer_kills ?? 0) + (p.sentry_kills ?? 0),
      runes: p.runes ?? {},
    }),
  );
  const you = players.find((p) => p.accountId === accountId32);
  // An unparsed match has no gold series: nothing to say.
  if (!you || you.goldAt10 === null) return null;
  return replaySummary(players, you);
}
