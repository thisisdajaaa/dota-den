import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/modules/shared/infrastructure/provider-gateway";
import type { PatchTimelineEntry } from "../domain/patch-assignment";
import { resultFor, sideFromPlayerSlot } from "../domain/player-match-fact";
import type {
  ImportedPage,
  ImportedPlayerMatch,
  MatchProvider,
  PatchTimelineSource,
  PlayerProfileSnapshot,
  ProviderError,
} from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";

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
});

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
export class OpenDotaAdapter implements MatchProvider, PatchTimelineSource {
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
}
