import { z } from "zod";
import type { ProviderGateway } from "./provider-gateway";
import type { StratzConfig } from "./stratz";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Fresh for 12 hours: the week asked for moves on once a day. */
export const MATCHUP_TTL_MS = 12 * HOUR;
/** After a failure, don't ask again for this long (per instance): a guard on STRATZ's limits. */
export const MATCHUP_RETRY_AFTER_FAILURE_MS = 5 * 60_000;
/**
 * Legend to Immortal. STRATZ's matchups only come in these paired brackets, and Divine–Immortal
 * alone is about a quarter of these games: too few for rare pairs.
 */
export const MATCHUP_BRACKETS = ["LEGEND_ANCIENT", "DIVINE_IMMORTAL"] as const;
/** Heroes per request: 40 tables is about 470 KB and takes a second or so. */
export const MATCHUP_CHUNK = 40;
/** Hero ids go up to about 150; chunks cover ids 1–200, so a new hero is picked up. */
export const MATCHUP_CHUNKS = 5;

/**
 * Which of STRATZ's weekly buckets to read. A timestamp picks the week it falls in, and
 * without one STRATZ answers with the current week, which is still filling up (two days in,
 * about a quarter of a full week's games). A day in the previous week always picks the latest
 * complete week. Snapped to midnight UTC so the cache key only changes once a day.
 */
export function weekFor(nowMs: number, weeksBack = 1): number {
  const t = nowMs - weeksBack * 7 * DAY;
  return Math.floor(t / DAY) * (DAY / 1000);
}

/** One hero's record: `wins` are always the table owner's wins. */
export interface HeroRecord {
  games: number;
  wins: number;
}

/** A hero's latest full week in Legend–Immortal pubs: overall, against and with each hero. */
export interface HeroMatchups {
  heroId: number;
  games: number;
  wins: number;
  /** Opponent id → games against it and the owner's wins. */
  vs: ReadonlyMap<number, HeroRecord>;
  /** Teammate id → games together and wins. */
  with: ReadonlyMap<number, HeroRecord>;
}

export const chunkOf = (heroId: number) => Math.floor((heroId - 1) / MATCHUP_CHUNK);
const idsOf = (chunk: number) =>
  Array.from({ length: MATCHUP_CHUNK }, (_, i) => chunk * MATCHUP_CHUNK + i + 1);

export const MATCHUPS_QUERY = `query DotaDenMatchups($heroIds: [Short], $week: Long, $brackets: [RankBracketBasicEnum]) {
  heroStats {
    matchUp(heroIds: $heroIds, week: $week, bracketBasicIds: $brackets, take: 200) {
      heroId
      vs { heroId2 matchCount winCount }
      with { heroId2 matchCount winCount }
    }
  }
}`;

const count = z.number().int().min(0);
const PairSchema = z
  .object({ heroId2: z.number().int().positive(), matchCount: count, winCount: count })
  .refine((p) => p.winCount <= p.matchCount, "more wins than games");

export const MatchupsResponseSchema = z.object({
  data: z.object({
    heroStats: z.object({
      matchUp: z.array(
        z.object({
          heroId: z.number().int().positive(),
          vs: z.array(PairSchema),
          with: z.array(PairSchema),
        }),
      ),
    }),
  }),
  // GraphQL reports field errors next to (possibly partial) data: never use or cache those.
  errors: z.array(z.unknown()).max(0).optional(),
});

/** Parse a STRATZ answer; heroes without games (ids that don't exist) are left out. */
export function parseMatchups(body: unknown): Map<number, HeroMatchups> | null {
  const parsed = MatchupsResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const out = new Map<number, HeroMatchups>();
  for (const h of parsed.data.data.heroStats.matchUp) {
    const vs = new Map(
      h.vs.map((p) => [p.heroId2, { games: p.matchCount, wins: p.winCount }] as const),
    );
    let pairs = 0;
    let pairWins = 0;
    for (const r of vs.values()) {
      pairs += r.games;
      pairWins += r.wins;
    }
    if (pairs === 0) continue;
    out.set(h.heroId, {
      heroId: h.heroId,
      // Every game has five opponents, so each game is counted five times across `vs`.
      games: Math.round(pairs / 5),
      wins: Math.round(pairWins / 5),
      vs,
      with: new Map(
        h.with.map((p) => [p.heroId2, { games: p.matchCount, wins: p.winCount }] as const),
      ),
    });
  }
  return out;
}

/**
 * STRATZ hero matchups, fetched 40 heroes at a time. Each chunk goes through the gateway's
 * cache (shared across servers when Redis is set up, with the last good copy served when a
 * refresh fails) and is kept parsed in memory. Null when STRATZ can't answer: callers fall
 * back to OpenDota.
 */
export class StratzHeroMatchups {
  private readonly memo = new Map<number, { value: Map<number, HeroMatchups>; at: number }>();
  private readonly inFlight = new Map<number, Promise<Map<number, HeroMatchups> | null>>();
  private failedUntil = 0;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly config: StratzConfig,
    private readonly now: () => number = Date.now,
    /** Weeks before the current one (1: the latest complete week). */
    private readonly weeksBack = 1,
  ) {}

  /** One hero's tables, or null when STRATZ has none for it or can't answer. */
  async forHero(heroId: number): Promise<HeroMatchups | null> {
    if (!Number.isInteger(heroId) || heroId < 1) return null;
    const chunk = await this.chunk(chunkOf(heroId));
    return chunk?.get(heroId) ?? null;
  }

  /** Every hero's tables, or null unless every chunk answered (no half-filled tables). */
  async all(): Promise<ReadonlyMap<number, HeroMatchups> | null> {
    const chunks = await Promise.all(
      Array.from({ length: MATCHUP_CHUNKS }, (_, i) => this.chunk(i)),
    );
    if (chunks.some((c) => c === null)) return null;
    return new Map(chunks.flatMap((c) => [...c!]));
  }

  private chunk(index: number): Promise<Map<number, HeroMatchups> | null> {
    const memo = this.memo.get(index);
    if (memo && this.now() - memo.at < MATCHUP_TTL_MS) return Promise.resolve(memo.value);
    const running = this.inFlight.get(index);
    if (running) return running;
    if (this.now() < this.failedUntil) return Promise.resolve(memo?.value ?? null);
    const task = this.load(index).finally(() => this.inFlight.delete(index));
    this.inFlight.set(index, task);
    return task;
  }

  private async load(index: number): Promise<Map<number, HeroMatchups> | null> {
    const res = await this.gateway.queryJson(
      `${this.config.baseUrl.replace(/\/$/, "")}/graphql`,
      {
        query: MATCHUPS_QUERY,
        variables: {
          heroIds: idsOf(index),
          week: weekFor(this.now(), this.weeksBack),
          brackets: MATCHUP_BRACKETS,
        },
      },
      {
        headers: {
          authorization: `Bearer ${this.config.token}`,
          // STRATZ refuses requests without this user agent.
          "user-agent": "STRATZ_API",
        },
        cacheTtlMs: MATCHUP_TTL_MS,
        cacheIf: (body) => MatchupsResponseSchema.safeParse(body).success,
      },
    );
    const parsed = res.ok ? parseMatchups(res.body) : null;
    if (parsed) {
      this.memo.set(index, { value: parsed, at: this.now() });
      this.failedUntil = 0;
      return parsed;
    }
    this.failedUntil = this.now() + MATCHUP_RETRY_AFTER_FAILURE_MS;
    // A copy past its freshness still beats nothing.
    return this.memo.get(index)?.value ?? null;
  }
}
