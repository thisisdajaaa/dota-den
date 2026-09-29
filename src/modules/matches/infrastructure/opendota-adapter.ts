import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/modules/shared/infrastructure/provider-gateway";
import type { MatchDetail, MatchPlayer } from "../domain/match-detail";
import type { PatchTimelineEntry } from "../domain/patch-assignment";
import { resultFor, sideFromPlayerSlot } from "../domain/player-match-fact";
import type {
  HeroCatalog,
  HeroInfo,
  ItemInfo,
  MatchDetailProvider,
  ImportedPage,
  ImportedPlayerMatch,
  MatchProvider,
  PatchTimelineSource,
  PlayerProfileSnapshot,
  ProviderError,
} from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";
export const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";

const nullableInt = z.number().int().nullable().optional();

/** Upstream shape of /players/{id}/matches rows. Anything unexpected is rejected, not guessed. */
const MatchRowSchema = z.object({
  match_id: z.number().int().positive(),
  player_slot: z.number().int().min(0).max(255),
  radiant_win: z.boolean(),
  duration: z.number().int().min(0),
  game_mode: nullableInt,
  lobby_type: nullableInt,
  hero_id: z.number().int().min(0),
  start_time: z.number().int().positive(),
  version: nullableInt,
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  average_rank: nullableInt,
  party_size: nullableInt,
});

const ProfileSchema = z.object({
  profile: z
    .object({
      account_id: z.number().int(),
      personaname: z.string().nullable().optional(),
      avatarfull: z.string().nullable().optional(),
      fh_unavailable: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  rank_tier: nullableInt,
  leaderboard_rank: nullableInt,
});

const HeroConstantsSchema = z.record(
  z.string(),
  z.object({
    id: z.number().int(),
    localized_name: z.string(),
    img: z.string(),
    icon: z.string(),
    primary_attr: z.string().nullable().optional(),
  }),
);

const nullableNum = z.number().nullable().optional();

const MatchPlayerSchema = z.object({
  player_slot: z.number().int().min(0).max(255),
  account_id: nullableInt,
  personaname: z.string().nullable().optional(),
  hero_id: z.number().int().min(0),
  level: z.number().int().min(0).default(0),
  kills: z.number().int().min(0).default(0),
  deaths: z.number().int().min(0).default(0),
  assists: z.number().int().min(0).default(0),
  last_hits: z.number().int().min(0).default(0),
  denies: z.number().int().min(0).default(0),
  gold_per_min: z.number().int().min(0).default(0),
  xp_per_min: z.number().int().min(0).default(0),
  net_worth: nullableNum,
  hero_damage: nullableNum,
  tower_damage: nullableNum,
  hero_healing: nullableNum,
  item_0: nullableInt,
  item_1: nullableInt,
  item_2: nullableInt,
  item_3: nullableInt,
  item_4: nullableInt,
  item_5: nullableInt,
  backpack_0: nullableInt,
  backpack_1: nullableInt,
  backpack_2: nullableInt,
  item_neutral: nullableInt,
  aghanims_scepter: nullableInt,
  aghanims_shard: nullableInt,
  party_id: nullableInt,
  party_size: nullableInt,
  rank_tier: nullableInt,
});

const MatchDetailSchema = z.object({
  match_id: z.number().int().positive(),
  start_time: z.number().int().positive(),
  duration: z.number().int().min(0),
  radiant_win: z.boolean(),
  radiant_score: z.number().int().min(0).default(0),
  dire_score: z.number().int().min(0).default(0),
  game_mode: nullableInt,
  lobby_type: nullableInt,
  region: nullableInt,
  first_blood_time: nullableInt,
  version: nullableInt,
  radiant_gold_adv: z.array(z.number()).nullable().optional(),
  radiant_xp_adv: z.array(z.number()).nullable().optional(),
  players: z.array(MatchPlayerSchema).min(1).max(24),
});

const ItemIdsSchema = z.record(z.string(), z.string());
const ItemsSchema = z.record(
  z.string(),
  z.object({ id: z.number().int(), img: z.string().optional(), dname: z.string().optional() }),
);

/** Only image paths under the Dota CDN tree are allowed (matches next.config remotePatterns). */
export function cdnImage(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/\?.*$/, "");
  if (clean.includes("..")) return null;
  return /^\/apps\/dota2\/[\w./-]+\.png$/.test(clean) ? `${STEAM_CDN}${clean}` : null;
}

/** OpenDota's anonymous-account sentinel. */
const ANONYMOUS_ACCOUNT_ID = 4294967295;

const slotItem = (id: number | null | undefined): number | null => (id ? id : null);

const PatchConstantsSchema = z.array(z.object({ name: z.string(), date: z.string() }));

const MATCH_FIELDS = [
  "duration",
  "game_mode",
  "lobby_type",
  "hero_id",
  "start_time",
  "version",
  "kills",
  "deaths",
  "assists",
  "average_rank",
  "party_size",
];

function toProviderError(res: Exclude<GatewayResponse, { ok: true }>): ProviderError {
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

/** Anti-corruption layer: OpenDota payloads → internal typed facts with provenance. */
export class OpenDotaAdapter
  implements MatchProvider, PatchTimelineSource, HeroCatalog, MatchDetailProvider
{
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { apiKey?: string; baseUrl?: string; now?: () => Date } = {},
  ) {}

  private url(path: string, params: Record<string, string | number | string[]> = {}): string {
    const url = new URL(`${this.opts.baseUrl ?? OPENDOTA_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  async fetchPlayerMatches(
    accountId32: number,
    page: { offset: number; limit: number },
  ): Promise<Result<ImportedPage, ProviderError>> {
    const res = await this.gateway.getJson(
      this.url(`/players/${accountId32}/matches`, {
        limit: page.limit,
        offset: page.offset,
        // Include unbalanced/non-ranked games too; classification handles them.
        significant: 0,
        project: MATCH_FIELDS,
      }),
    );
    if (!res.ok) return err(toProviderError(res));
    if (!Array.isArray(res.body)) return err({ type: "invalid_payload", cause: "expected array" });

    const fetchedAt = (this.opts.now ?? (() => new Date()))();
    const matches: ImportedPlayerMatch[] = [];
    let rejectedCount = 0;
    for (const raw of res.body) {
      const row = MatchRowSchema.safeParse(raw);
      if (!row.success) {
        rejectedCount++;
        continue;
      }
      const r = row.data;
      const side = sideFromPlayerSlot(r.player_slot);
      matches.push({
        accountId32,
        matchId: String(r.match_id),
        startedAt: new Date(r.start_time * 1000),
        durationSec: r.duration,
        heroId: r.hero_id,
        side,
        result: resultFor(side, r.radiant_win),
        kills: r.kills,
        deaths: r.deaths,
        assists: r.assists,
        gameMode: r.game_mode ?? null,
        lobbyType: r.lobby_type ?? null,
        role: null,
        partySize: r.party_size ?? null,
        averageRankTier: r.average_rank ?? null,
        provenance: {
          provider: "opendota",
          fetchedAt,
          parseStatus: r.version === null || r.version === undefined ? "unparsed" : "parsed",
        },
      });
    }
    return ok({ matches, rejectedCount });
  }

  async fetchPlayerProfile(
    accountId32: number,
  ): Promise<Result<PlayerProfileSnapshot, ProviderError>> {
    const res = await this.gateway.getJson(this.url(`/players/${accountId32}`), {
      cacheTtlMs: 10 * 60 * 1000,
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = ProfileSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "profile" });
    const profile = parsed.data.profile;
    // OpenDota returns no profile for accounts it has never seen.
    if (!profile) return err({ type: "not_found" });
    return ok({
      accountId32,
      personaName: profile.personaname ?? null,
      avatarUrl: profile.avatarfull ?? null,
      matchHistory:
        profile.fh_unavailable === true
          ? "limited"
          : profile.fh_unavailable === false
            ? "full"
            : "unknown",
      rankTier: parsed.data.rank_tier ?? null,
      leaderboardRank: parsed.data.leaderboard_rank ?? null,
    });
  }

  async getTimeline(): Promise<Result<PatchTimelineEntry[], ProviderError>> {
    const res = await this.gateway.getJson(this.url("/constants/patch"), {
      cacheTtlMs: 6 * 60 * 60 * 1000,
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = PatchConstantsSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "patch constants" });
    return ok(
      parsed.data
        .map((p) => ({ name: p.name, releasedAt: new Date(p.date) }))
        .filter((p) => !Number.isNaN(p.releasedAt.getTime())),
    );
  }

  async getHeroes(): Promise<Result<HeroInfo[], ProviderError>> {
    const res = await this.gateway.getJson(this.url("/constants/heroes"), {
      cacheTtlMs: 24 * 60 * 60 * 1000,
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = HeroConstantsSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "hero constants" });
    return ok(
      Object.values(parsed.data).map((h) => ({
        id: h.id,
        name: h.localized_name,
        imageUrl: cdnImage(h.img),
        iconUrl: cdnImage(h.icon),
        primaryAttr:
          (["str", "agi", "int", "all"] as const).find((a) => a === h.primary_attr) ?? null,
      })),
    );
  }

  async fetchMatch(matchId: string): Promise<Result<MatchDetail, ProviderError>> {
    if (!/^\d{1,20}$/.test(matchId)) return err({ type: "not_found" });
    const res = await this.gateway.getJson(this.url(`/matches/${matchId}`), {
      cacheTtlMs: 10 * 60 * 1000,
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = MatchDetailSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "match" });
    const m = parsed.data;

    const players: MatchPlayer[] = m.players.map((p) => {
      const known =
        p.account_id !== null &&
        p.account_id !== undefined &&
        p.account_id !== ANONYMOUS_ACCOUNT_ID;
      return {
        playerSlot: p.player_slot,
        side: sideFromPlayerSlot(p.player_slot),
        accountId32: known ? p.account_id! : null,
        personaName: known ? (p.personaname ?? null) : null,
        heroId: p.hero_id,
        level: p.level,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        lastHits: p.last_hits,
        denies: p.denies,
        goldPerMin: p.gold_per_min,
        xpPerMin: p.xp_per_min,
        netWorth: p.net_worth ?? null,
        heroDamage: p.hero_damage ?? null,
        towerDamage: p.tower_damage ?? null,
        heroHealing: p.hero_healing ?? null,
        items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map(slotItem),
        backpack: [p.backpack_0, p.backpack_1, p.backpack_2].map(slotItem),
        neutralItem: slotItem(p.item_neutral),
        hasScepter: p.aghanims_scepter === 1,
        hasShard: p.aghanims_shard === 1,
        partyId: p.party_id ?? null,
        partySize: p.party_size ?? null,
        rankTier: p.rank_tier ?? null,
      };
    });

    const advantage = (xs: number[] | null | undefined) => (xs && xs.length > 1 ? xs : null);
    return ok({
      matchId: String(m.match_id),
      startedAt: new Date(m.start_time * 1000),
      durationSec: m.duration,
      radiantWin: m.radiant_win,
      radiantScore: m.radiant_score,
      direScore: m.dire_score,
      gameMode: m.game_mode ?? null,
      lobbyType: m.lobby_type ?? null,
      region: m.region ?? null,
      firstBloodSec: m.first_blood_time ?? null,
      parsed: m.version !== null && m.version !== undefined,
      goldAdvantage: advantage(m.radiant_gold_adv),
      xpAdvantage: advantage(m.radiant_xp_adv),
      players,
      fetchedAt: (this.opts.now ?? (() => new Date()))(),
    });
  }

  async getItems(): Promise<Result<ItemInfo[], ProviderError>> {
    const ttl = { cacheTtlMs: 24 * 60 * 60 * 1000 };
    const [idsRes, itemsRes] = await Promise.all([
      this.gateway.getJson(this.url("/constants/item_ids"), ttl),
      this.gateway.getJson(this.url("/constants/items"), ttl),
    ]);
    if (!idsRes.ok) return err(toProviderError(idsRes));
    if (!itemsRes.ok) return err(toProviderError(itemsRes));
    const ids = ItemIdsSchema.safeParse(idsRes.body);
    const items = ItemsSchema.safeParse(itemsRes.body);
    if (!ids.success || !items.success)
      return err({ type: "invalid_payload", cause: "item constants" });

    const out: ItemInfo[] = [];
    for (const [id, key] of Object.entries(ids.data)) {
      const item = items.data[key];
      if (!item) continue;
      out.push({
        id: Number(id),
        name: item.dname ?? key.replaceAll("_", " "),
        imageUrl: cdnImage(item.img),
      });
    }
    return ok(out);
  }
}
