import { z } from "zod";
import { err, ok, type Result } from "@/common/result";
import type { GatewayResponse, ProviderGateway } from "@/common/providers/provider-gateway";
import type { WinCount } from "../domain/meta-stats";
import { POSITIONS, type Position } from "../domain/position";
import type { PositionCounts, PositionStats } from "../domain/position-stats";
import type { Fetched, PositionStatsSource, SourceError, SourceResult } from "../meta.ports";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Fresh for 6 hours (memory and the shared cache): STRATZ's daily totals change once a day. */
export const STRATZ_TTL_MS = 6 * HOUR;
/** When a refresh fails, keep serving the last good value for up to this long. */
export const STRATZ_STALE_GRACE_MS = 48 * HOUR;
/** After a failure, don't ask again for this long (per instance): a guard on STRATZ's limits. */
export const STRATZ_RETRY_AFTER_FAILURE_MS = 5 * 60_000;
/**
 * Days of daily totals per position. STRATZ's weekly totals only cover complete weeks and its
 * per-patch totals stopped at 7.40, so the latest 7 days of daily totals are the freshest
 * full week (about 1.2 million Ancient–Immortal games).
 */
export const STRATZ_DAYS = 7;
/** Ancient, Divine and Immortal: the same brackets as OpenDota's high-rank stats (6–8). */
export const STRATZ_BRACKETS = ["ANCIENT", "DIVINE", "IMMORTAL"] as const;
/**
 * STRATZ's daily totals run a while behind (about two weeks in October 2026). Older than this
 * and the data no longer says what's strong now, so the Meta page falls back to OpenDota.
 */
export const STRATZ_MAX_LAG_DAYS = 28;

/** One request for all five positions (aliases), so a refresh costs a single call. */
export const POSITION_STATS_QUERY = `query DotaDenPositionStats($days: Int!, $brackets: [RankBracket]) {
  heroStats {
${POSITIONS.map(
  (p) =>
    `    pos${p}: winDay(take: $days, positionIds: [POSITION_${p}], bracketIds: $brackets) { heroId day matchCount winCount }`,
).join("\n")}
  }
}`;

const count = z.number().int().min(0);
const RowSchema = z
  .object({
    heroId: z.number().int().positive(),
    /** Start of the UTC day, in seconds. */
    day: z.number().int().min(0),
    matchCount: count,
    winCount: count,
  })
  .refine((r) => r.winCount <= r.matchCount, "more wins than games");

const rows = z.array(RowSchema).min(1);

export const PositionStatsResponseSchema = z.object({
  data: z.object({
    heroStats: z.object({ pos1: rows, pos2: rows, pos3: rows, pos4: rows, pos5: rows }),
  }),
  // GraphQL reports field errors next to (possibly partial) data: never use or cache those.
  errors: z.array(z.unknown()).max(0).optional(),
});

const isoDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Parse a STRATZ answer into per-hero position counts; anything malformed fails it all. */
export function parsePositionStats(body: unknown, now: Date): Result<PositionStats, SourceError> {
  const parsed = PositionStatsResponseSchema.safeParse(body);
  if (!parsed.success) {
    const graphqlErrors =
      typeof body === "object" && body !== null && "errors" in body && body.errors;
    return err(
      graphqlErrors
        ? { type: "unavailable", cause: "stratz graphql errors" }
        : { type: "invalid_payload", cause: "stratz position stats" },
    );
  }
  const empty = (): Record<Position, WinCount> => ({
    1: { games: 0, wins: 0 },
    2: { games: 0, wins: 0 },
    3: { games: 0, wins: 0 },
    4: { games: 0, wins: 0 },
    5: { games: 0, wins: 0 },
  });
  const heroes = new Map<number, Record<Position, WinCount>>();
  const days = new Set<number>();
  for (const p of POSITIONS) {
    for (const r of parsed.data.data.heroStats[`pos${p}`]) {
      const counts = heroes.get(r.heroId) ?? empty();
      counts[p] = { games: counts[p].games + r.matchCount, wins: counts[p].wins + r.winCount };
      heroes.set(r.heroId, counts);
      days.add(r.day);
    }
  }
  const first = Math.min(...days);
  const last = Math.max(...days);
  if (now.getTime() - last * 1000 > STRATZ_MAX_LAG_DAYS * DAY)
    return err({ type: "unavailable", cause: "stratz data too old" });
  return ok({
    heroes: heroes as ReadonlyMap<number, PositionCounts>,
    window: { from: isoDay(first), to: isoDay(last), days: days.size },
  });
}

function toSourceError(res: Exclude<GatewayResponse, { ok: true }>): SourceError {
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

/**
 * STRATZ per-position public stats over its GraphQL API. Kept in memory with the fetch time;
 * every call also goes through the gateway's cache (shared across servers when Redis is set
 * up). When a refresh fails the last good value is served for up to 48h, and this instance
 * waits 5 minutes before asking STRATZ again.
 */
export class StratzPositionSource implements PositionStatsSource {
  private memo: { value: PositionStats; fetchedAt: Date } | null = null;
  private inFlight: Promise<Result<Fetched<PositionStats>, SourceError>> | null = null;
  private failedUntil = 0;
  private lastError: SourceError | null = null;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly opts: { baseUrl: string; token: string; now?: () => Date },
  ) {}

  private now(): Date {
    return (this.opts.now ?? (() => new Date()))();
  }

  positionStats(): SourceResult<PositionStats> {
    const now = this.now().getTime();
    if (this.memo && this.memo.fetchedAt.getTime() + STRATZ_TTL_MS > now)
      return Promise.resolve(ok(this.memo));
    if (this.inFlight) return this.inFlight;
    if (now < this.failedUntil) return Promise.resolve(this.staleOr(this.lastError));
    this.inFlight = this.load().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private staleOr(error: SourceError | null): Result<Fetched<PositionStats>, SourceError> {
    if (this.memo && this.now().getTime() - this.memo.fetchedAt.getTime() < STRATZ_STALE_GRACE_MS)
      return ok(this.memo);
    return err(error ?? { type: "unavailable", cause: "stratz retry wait" });
  }

  private async load(): Promise<Result<Fetched<PositionStats>, SourceError>> {
    const res = await this.gateway.queryJson(
      `${this.opts.baseUrl.replace(/\/$/, "")}/graphql`,
      {
        query: POSITION_STATS_QUERY,
        variables: { days: STRATZ_DAYS, brackets: STRATZ_BRACKETS },
      },
      {
        headers: {
          authorization: `Bearer ${this.opts.token}`,
          // STRATZ refuses requests without this user agent.
          "user-agent": "STRATZ_API",
        },
        cacheTtlMs: STRATZ_TTL_MS,
        cacheIf: (body) => PositionStatsResponseSchema.safeParse(body).success,
      },
    );
    const parsed = res.ok
      ? parsePositionStats(res.body, this.now())
      : err<SourceError>(toSourceError(res));
    if (parsed.ok) {
      const fetchedAt = res.ok && res.fetchedAt ? new Date(res.fetchedAt) : this.now();
      this.memo = { value: parsed.value, fetchedAt };
      this.failedUntil = 0;
      return ok(this.memo);
    }
    this.lastError = parsed.error;
    this.failedUntil = this.now().getTime() + STRATZ_RETRY_AFTER_FAILURE_MS;
    return this.staleOr(parsed.error);
  }
}
