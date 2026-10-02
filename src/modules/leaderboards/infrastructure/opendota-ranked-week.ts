import { z } from "zod";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { bestHeroOf, RANKED_WEEK_DAYS, type RankedWeekInput } from "../domain/ranked-week";

const CACHE_MS = 30 * 60_000;
/** Ranked matchmaking. */
const RANKED_LOBBY = "7";
const n = z.coerce.number().int().min(0).catch(0);
const WinLoss = z.object({ win: n, lose: n });
const Heroes = z.array(z.object({ hero_id: z.coerce.number().int().positive(), games: n, win: n }));

function weekUrl(
  opts: { baseUrl: string; apiKey?: string },
  accountId32: number,
  path: "wl" | "heroes",
): string {
  const u = new URL(`${opts.baseUrl}/players/${accountId32}/${path}`);
  u.searchParams.set("date", String(RANKED_WEEK_DAYS));
  u.searchParams.set("lobby_type", RANKED_LOBBY);
  if (opts.apiKey) u.searchParams.set("api_key", opts.apiKey);
  return u.toString();
}

/** One player's ranked wins and losses this week (public data). Null when OpenDota can't say. */
export async function rankedWeekFor(
  gateway: ProviderGateway,
  opts: { baseUrl: string; apiKey?: string },
  accountId32: number,
): Promise<RankedWeekInput | null> {
  const wl = await gateway.getJson(weekUrl(opts, accountId32, "wl"), { cacheTtlMs: CACHE_MS });
  if (!wl.ok) return null;
  const record = WinLoss.safeParse(wl.body);
  if (!record.success) return null;
  return { accountId32, wins: record.data.win, losses: record.data.lose, bestHero: null };
}

/** Their best hero this week (most wins, 2+ games). Fetched only for the top of the board. */
export async function bestHeroThisWeek(
  gateway: ProviderGateway,
  opts: { baseUrl: string; apiKey?: string },
  accountId32: number,
): Promise<RankedWeekInput["bestHero"]> {
  const res = await gateway.getJson(weekUrl(opts, accountId32, "heroes"), { cacheTtlMs: CACHE_MS });
  if (!res.ok) return null;
  const rows = Heroes.safeParse(res.body);
  if (!rows.success) return null;
  return bestHeroOf(
    rows.data.map((h) => ({ heroId: h.hero_id, games: h.games, wins: Math.min(h.win, h.games) })),
  );
}
