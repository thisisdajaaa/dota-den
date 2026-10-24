import { z } from "zod";
import type { ProviderGateway } from "./provider-gateway";
import type { StratzConfig } from "./stratz";
import { MATCHUP_BRACKETS, weekFor } from "./stratz-hero-matchups";

const HOUR = 3_600_000;
/** Fresh for 12 hours: the week asked for moves on once a day. */
export const ITEMS_TTL_MS = 12 * HOUR;
/** After a failure, don't ask again for this long (per instance). */
export const ITEMS_RETRY_AFTER_FAILURE_MS = 5 * 60_000;
/** Heroes kept parsed in memory per instance (each is a few hundred rows). */
const MEMO_HEROES = 150;

export const POSITION_IDS = [1, 2, 3, 4, 5] as const;
export type PositionId = (typeof POSITION_IDS)[number];

/** One item at one position: how often it was bought, how those games ended, and when. */
export interface ItemRecord {
  itemId: number;
  games: number;
  wins: number;
  /** The minute by which half of its purchases were made; null for starting items. */
  minute: number | null;
}

/** A hero's latest full week at one position in Legend–Immortal pubs. */
export interface PositionBuild {
  position: PositionId;
  /** The hero's games at this position (STRATZ's per-position totals). */
  games: number;
  wins: number;
  /** Completed items bought during the game (first copy only). */
  items: ItemRecord[];
  /** Bought before the horn by the player themself (not handed over by a teammate). */
  starting: ItemRecord[];
}

const count = z.number().int().min(0);
const FullRow = z.object({
  itemId: z.number().int().positive(),
  instance: z.number().int().min(0),
  time: z.number().int().min(0),
  matchCount: count,
  winCount: count,
});
const StartRow = z.object({
  itemId: z.number().int().positive(),
  instance: z.number().int().min(0),
  wasGiven: z.boolean().nullable(),
  matchCount: count,
  winCount: count,
});
const PositionRow = z.object({
  position: z.enum(["POSITION_1", "POSITION_2", "POSITION_3", "POSITION_4", "POSITION_5"]),
  matchCount: count,
  winCount: count,
});

export const ItemsResponseSchema = z.object({
  data: z.object({
    heroStats: z
      .object({ positions: z.array(PositionRow) })
      .catchall(z.array(z.union([FullRow, StartRow]))),
  }),
  errors: z.array(z.unknown()).max(0).optional(),
});

export const ITEMS_QUERY = `query DotaDenItems($heroId: Short!, $week: Long, $brackets: [RankBracketBasicEnum]) {
  heroStats {
    positions: stats(heroIds: [$heroId], week: $week, bracketBasicIds: $brackets, groupByPosition: true) { position matchCount winCount }
${POSITION_IDS.map(
  (p) =>
    `    full${p}: itemFullPurchase(heroId: $heroId, week: $week, bracketBasicIds: $brackets, positionIds: [POSITION_${p}]) { itemId instance time matchCount winCount }
    start${p}: itemStartingPurchase(heroId: $heroId, week: $week, bracketBasicIds: $brackets, positionIds: [POSITION_${p}]) { itemId instance wasGiven matchCount winCount }`,
).join("\n")}
  }
}`;

/** The minute by which half of an item's purchases were made (rows are per-minute counts). */
function medianMinute(rows: readonly { time: number; matchCount: number }[]): number | null {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  const total = sorted.reduce((n, r) => n + r.matchCount, 0);
  if (total === 0) return null;
  let seen = 0;
  for (const r of sorted) {
    seen += r.matchCount;
    if (seen * 2 >= total) return r.time;
  }
  return sorted[sorted.length - 1].time;
}

/** Parse a STRATZ answer into one build per position; anything malformed fails it all. */
export function parseItems(body: unknown): PositionBuild[] | null {
  const parsed = ItemsResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const stats = parsed.data.data.heroStats as Record<string, unknown>;
  const builds: PositionBuild[] = [];
  for (const p of POSITION_IDS) {
    const totals = (stats.positions as z.infer<typeof PositionRow>[]).find(
      (r) => r.position === `POSITION_${p}`,
    );
    const full = z.array(FullRow).safeParse(stats[`full${p}`] ?? []);
    const start = z.array(StartRow).safeParse(stats[`start${p}`] ?? []);
    if (!full.success || !start.success) return null;
    const byItem = new Map<number, z.infer<typeof FullRow>[]>();
    for (const r of full.data) {
      if (r.instance !== 0) continue;
      byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
    }
    const items = [...byItem].map(([itemId, rows]) => ({
      itemId,
      games: rows.reduce((n, r) => n + r.matchCount, 0),
      wins: rows.reduce((n, r) => n + r.winCount, 0),
      minute: medianMinute(rows),
    }));
    const starting = start.data
      .filter((r) => r.instance === 0 && r.wasGiven !== true)
      .map((r) => ({ itemId: r.itemId, games: r.matchCount, wins: r.winCount, minute: null }));
    builds.push({
      position: p,
      games: totals?.matchCount ?? 0,
      wins: totals?.winCount ?? 0,
      items: items.filter((i) => i.games > 0 && i.wins <= i.games),
      starting: starting.filter((i) => i.games > 0 && i.wins <= i.games),
    });
  }
  return builds;
}

/**
 * STRATZ item builds per hero and position: one request per hero (all five positions),
 * through the gateway's cache (shared across servers, last good copy kept when a refresh
 * fails) and kept parsed in memory. Null when STRATZ can't answer: callers fall back.
 */
export class StratzHeroItems {
  private readonly memo = new Map<number, { value: PositionBuild[]; at: number }>();
  private readonly inFlight = new Map<number, Promise<PositionBuild[] | null>>();
  private failedUntil = 0;

  constructor(
    private readonly gateway: ProviderGateway,
    private readonly config: StratzConfig,
    private readonly now: () => number = Date.now,
  ) {}

  forHero(heroId: number): Promise<PositionBuild[] | null> {
    if (!Number.isInteger(heroId) || heroId < 1) return Promise.resolve(null);
    const memo = this.memo.get(heroId);
    if (memo && this.now() - memo.at < ITEMS_TTL_MS) return Promise.resolve(memo.value);
    const running = this.inFlight.get(heroId);
    if (running) return running;
    if (this.now() < this.failedUntil) return Promise.resolve(memo?.value ?? null);
    const task = this.load(heroId).finally(() => this.inFlight.delete(heroId));
    this.inFlight.set(heroId, task);
    return task;
  }

  private async load(heroId: number): Promise<PositionBuild[] | null> {
    const res = await this.gateway.queryJson(
      `${this.config.baseUrl.replace(/\/$/, "")}/graphql`,
      {
        query: ITEMS_QUERY,
        variables: { heroId, week: weekFor(this.now()), brackets: MATCHUP_BRACKETS },
      },
      {
        headers: {
          authorization: `Bearer ${this.config.token}`,
          // STRATZ refuses requests without this user agent.
          "user-agent": "STRATZ_API",
        },
        cacheTtlMs: ITEMS_TTL_MS,
        cacheIf: (body) => parseItems(body) !== null,
      },
    );
    const parsed = res.ok ? parseItems(res.body) : null;
    if (parsed) {
      this.memo.delete(heroId);
      this.memo.set(heroId, { value: parsed, at: this.now() });
      // Oldest first in a Map: drop the least recently refreshed hero past the cap.
      if (this.memo.size > MEMO_HEROES) this.memo.delete(this.memo.keys().next().value!);
      this.failedUntil = 0;
      return parsed;
    }
    this.failedUntil = this.now() + ITEMS_RETRY_AFTER_FAILURE_MS;
    return this.memo.get(heroId)?.value ?? null;
  }
}
