import { z } from "zod";
import type { ProviderGateway } from "./provider-gateway";
import type { StratzConfig } from "./stratz";
import { weekFor } from "./stratz-hero-matchups";

const HOUR = 3_600_000;
/** Fresh for 12 hours: the week asked for moves on once a day. */
export const CURVES_TTL_MS = 12 * HOUR;
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;
const MEMO_MAX = 600;

export const BRACKETS = [
  "HERALD_GUARDIAN",
  "CRUSADER_ARCHON",
  "LEGEND_ANCIENT",
  "DIVINE_IMMORTAL",
] as const;
export type Bracket = (typeof BRACKETS)[number];

/** One minute of a hero's games at a rank: averages over the games still going then. */
export interface CurvePoint {
  minute: number;
  games: number;
  lastHits: number;
  /** Kills plus assists. */
  fights: number;
  deaths: number;
}

const num = z.number().min(0);
const Point = z.object({
  time: z.number().int().min(0).max(200),
  matchCount: z.number().int().min(0),
  cs: num,
  kills: num,
  assists: num,
  deaths: num,
});

export const curvesQuery = (
  heroIds: readonly number[],
) => `query DotaDenCurves($week: Long, $bracket: [RankBracketBasicEnum]) {
  heroStats {
${heroIds
  .map(
    (id) =>
      `    h${id}: stats(heroIds: [${id}], week: $week, bracketBasicIds: $bracket, groupByTime: true) { time matchCount cs kills assists deaths }`,
  )
  .join("\n")}
  }
}`;

/** Parse an answer into a curve per hero; null for any error or malformed row. */
export function parseCurves(
  body: unknown,
  heroIds: readonly number[],
): Map<number, CurvePoint[]> | null {
  const parsed = z
    .object({
      data: z.object({ heroStats: z.record(z.string(), z.array(Point)) }),
      errors: z.array(z.unknown()).max(0).optional(),
    })
    .safeParse(body);
  if (!parsed.success) return null;
  const out = new Map<number, CurvePoint[]>();
  for (const id of heroIds) {
    const rows = parsed.data.data.heroStats[`h${id}`];
    if (!rows) return null;
    out.set(
      id,
      rows
        .map((r) => ({
          minute: r.time,
          games: r.matchCount,
          lastHits: r.cs,
          fights: r.kills + r.assists,
          deaths: r.deaths,
        }))
        .sort((a, b) => a.minute - b.minute),
    );
  }
  return out;
}

/**
 * STRATZ's minute-by-minute averages per hero and rank bracket (the latest full week of
 * games): what players at a rank have by each minute. Missing heroes are fetched together in
 * one request; each answer is cached (shared, last good copy kept) and kept parsed per hero.
 * Null when STRATZ can't answer.
 */
export class StratzHeroCurves {
  private readonly memo = new Map<string, { value: CurvePoint[]; at: number }>();
  private failedUntil = 0;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly config: StratzConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async forHeroes(
    heroIds: readonly number[],
    bracket: Bracket,
  ): Promise<Map<number, CurvePoint[]> | null> {
    const ids = [...new Set(heroIds)]
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
    const out = new Map<number, CurvePoint[]>();
    const missing: number[] = [];
    for (const id of ids) {
      const m = this.memo.get(`${bracket}:${id}`);
      if (m && this.now() - m.at < CURVES_TTL_MS) out.set(id, m.value);
      else missing.push(id);
    }
    if (missing.length === 0) return out;
    if (this.now() < this.failedUntil) return null;
    const res = await this.gateway.queryJson(
      `${this.config.baseUrl.replace(/\/$/, "")}/graphql`,
      { query: curvesQuery(missing), variables: { week: weekFor(this.now()), bracket: [bracket] } },
      {
        headers: { authorization: `Bearer ${this.config.token}`, "user-agent": "STRATZ_API" },
        cacheTtlMs: CURVES_TTL_MS,
        cacheIf: (body) => parseCurves(body, missing) !== null,
      },
    );
    const parsed = res.ok ? parseCurves(res.body, missing) : null;
    if (!parsed) {
      this.failedUntil = this.now() + RETRY_AFTER_FAILURE_MS;
      return null;
    }
    for (const [id, curve] of parsed) {
      this.memo.set(`${bracket}:${id}`, { value: curve, at: this.now() });
      out.set(id, curve);
    }
    while (this.memo.size > MEMO_MAX) this.memo.delete(this.memo.keys().next().value!);
    return out;
  }
}
