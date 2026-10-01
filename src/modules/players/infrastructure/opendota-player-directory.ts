import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  GatewayResponse,
  ProviderGateway,
} from "@/modules/shared/infrastructure/provider-gateway";
import { ACCOUNT_ID_MAX } from "../domain/player-lookup";
import type { HeroUsage, Peer, PlayerSearchHit, WinLoss } from "../domain/public-player";
import type { PlayerDirectory, ProviderError } from "../application/ports";

export const OPENDOTA_BASE_URL = "https://api.opendota.com/api";

/** Profile-ish data changes slowly; cache it per instance for ten minutes. */
export const PROFILE_TTL_MS = 10 * 60 * 1000;
export const SEARCH_TTL_MS = 5 * 60 * 1000;
export const SEARCH_TIMEOUT_MS = 12_000;

const accountId = z.number().int().min(1).max(ACCOUNT_ID_MAX);
const count = z.number().int().min(0);
const optionalString = z.string().nullable().optional();
/** OpenDota has returned hero ids both as numbers and numeric strings over the years. */
const heroId = z.union([
  z.number().int().min(1).max(100_000),
  z
    .string()
    .regex(/^\d{1,6}$/)
    .transform(Number)
    .pipe(z.number().int().min(1)),
]);
/** Unix seconds; OpenDota uses 0 for "never". */
const unixSeconds = z.number().int().min(0).nullable().optional();

const SearchRowSchema = z.object({
  account_id: accountId,
  personaname: optionalString,
  avatarfull: optionalString,
  last_match_time: optionalString,
});

const WinLossSchema = z.object({ win: count, lose: count });

const HeroRowSchema = z.object({
  hero_id: heroId,
  games: count,
  win: count,
  last_played: unixSeconds,
});

const PeerRowSchema = z.object({
  account_id: accountId,
  personaname: optionalString,
  avatarfull: optionalString,
  with_games: count,
  with_win: count,
  against_games: count.default(0),
  against_win: count.default(0),
  last_played: unixSeconds,
});

const LastMatchSchema = z.array(z.object({ start_time: z.number().int().positive() }));

/**
 * Only Steam's avatar CDN is rendered (matches next.config remotePatterns); anything else
 * becomes null and the UI shows an initial instead.
 */
export function steamAvatar(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "avatars.steamstatic.com" && !u.username
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fromUnix = (s: number | null | undefined): Date | null => (s ? new Date(s * 1000) : null);

/** Non-empty persona names only; OpenDota uses "" for unknown. */
const name = (s: string | null | undefined): string | null => (s && s.trim() ? s : null);

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

/** Validate each row on its own: one malformed row is skipped, not the whole list. */
function parseRows<S extends z.ZodType, T>(
  body: unknown,
  schema: S,
  map: (row: z.infer<S>) => T,
): Result<T[], ProviderError> {
  if (!Array.isArray(body)) return err({ type: "invalid_payload", cause: "expected array" });
  const out: T[] = [];
  for (const raw of body) {
    const row = schema.safeParse(raw);
    if (row.success) out.push(map(row.data));
  }
  return ok(out);
}

/** Anti-corruption layer for OpenDota's public player endpoints. */
export class OpenDotaPlayerDirectory implements PlayerDirectory {
  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { apiKey?: string; baseUrl?: string } = {},
  ) {}

  private url(path: string, params: Record<string, string | number> = {}): string {
    const url = new URL(`${this.opts.baseUrl ?? OPENDOTA_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    if (this.opts.apiKey) url.searchParams.set("api_key", this.opts.apiKey);
    return url.toString();
  }

  private async get(path: string, ttl: number, params?: Record<string, string | number>) {
    return this.gateway.getJson(this.url(path, params), { cacheTtlMs: ttl });
  }

  async search(q: string): Promise<Result<PlayerSearchHit[], ProviderError>> {
    // OpenDota's name search is slow and uneven (1–10s+). Wait once, a little longer, rather
    // than retrying a slow query up to three times; and keep it off the shared circuit.
    const res = await this.gateway.getJson(this.url("/search", { q }), {
      cacheTtlMs: SEARCH_TTL_MS,
      timeoutMs: SEARCH_TIMEOUT_MS,
      maxRetries: 0,
      isolated: true,
    });
    if (!res.ok) return err(toProviderError(res));
    return parseRows(res.body, SearchRowSchema, (r) => ({
      accountId32: r.account_id,
      personaName: name(r.personaname),
      avatarUrl: steamAvatar(r.avatarfull),
      lastMatchAt: toDate(r.last_match_time),
    }));
  }

  async winLoss(accountId32: number): Promise<Result<WinLoss, ProviderError>> {
    const res = await this.get(`/players/${accountId32}/wl`, PROFILE_TTL_MS);
    if (!res.ok) return err(toProviderError(res));
    const parsed = WinLossSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "wl" });
    return ok({ wins: parsed.data.win, losses: parsed.data.lose });
  }

  async heroes(accountId32: number): Promise<Result<HeroUsage[], ProviderError>> {
    const res = await this.get(`/players/${accountId32}/heroes`, PROFILE_TTL_MS);
    if (!res.ok) return err(toProviderError(res));
    return parseRows(res.body, HeroRowSchema, (r) => ({
      heroId: r.hero_id,
      games: r.games,
      // A row claiming more wins than games is corrupt; clamp rather than show >100%.
      wins: Math.min(r.win, r.games),
      lastPlayedAt: fromUnix(r.last_played),
    }));
  }

  async peers(accountId32: number): Promise<Result<Peer[], ProviderError>> {
    const res = await this.get(`/players/${accountId32}/peers`, PROFILE_TTL_MS);
    if (!res.ok) return err(toProviderError(res));
    return parseRows(res.body, PeerRowSchema, (r) => ({
      accountId32: r.account_id,
      personaName: name(r.personaname),
      avatarUrl: steamAvatar(r.avatarfull),
      withGames: r.with_games,
      withWins: Math.min(r.with_win, r.with_games),
      againstGames: r.against_games,
      againstWins: Math.min(r.against_win, r.against_games),
      lastPlayedAt: fromUnix(r.last_played),
    }));
  }

  async lastMatchAt(accountId32: number): Promise<Result<Date | null, ProviderError>> {
    const res = await this.get(`/players/${accountId32}/matches`, PROFILE_TTL_MS, {
      limit: 1,
      significant: 0,
      project: "start_time",
    });
    if (!res.ok) return err(toProviderError(res));
    const parsed = LastMatchSchema.safeParse(res.body);
    if (!parsed.success) return err({ type: "invalid_payload", cause: "matches" });
    return ok(fromUnix(parsed.data[0]?.start_time));
  }
}
