import { err, ok, type Result } from "@/modules/shared/domain/result";
import { duosForPosition, type DuoResult } from "../domain/lane-duos";
import {
  laneCandidates,
  rankHeroes,
  totalPickTrend,
  MIN_PRO_DRAFTS,
  type LaneStats,
  type ProDrafts,
  type RankedHero,
} from "../domain/meta-stats";
import { deriveRole, type Position, type RoleDerivation } from "../domain/position";
import type { MetaHero, MetaStatsSource, PlayerLaneHistory, SourceError } from "./ports";

/** How many heroes to fetch lane data for per position (upstream calls are bounded). */
export const LANE_CANDIDATES = 28;
export const LANE_CONCURRENCY = 4;
export const TOP_HEROES = 10;
/** Tournament data is a bonus: don't hold the hero list back for it longer than this. */
export const PRO_DEADLINE_MS = 8_000;
export const LANE_DEADLINE_MS = 12_000;

export interface TopHeroesView {
  position: Position;
  heroes: RankedHero[];
  /** Heroes whose lane data we checked for this position. */
  checked: number;
  sources: {
    publicFetchedAt: Date;
    /** "partial" when some heroes' lane data failed; "unavailable" when all did. */
    lane: "ok" | "partial" | "unavailable";
    /** Oldest lane data used. */
    laneFetchedAt: Date | null;
    pro:
      | { status: "ok"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "too_few"; drafts: number; windowDays: number; fetchedAt: Date }
      | { status: "unavailable" };
  };
}

export interface DuosView {
  result: DuoResult;
  windowDays: number | null;
  fetchedAt: Date | null;
}

export interface RoleView {
  derivation: RoleDerivation;
  windowDays: number;
  fetchedAt: Date;
}

const TIMEOUT = Symbol("timeout");

/** Resolve to the promise's value, or TIMEOUT after `ms` (the promise keeps running and warms caches). */
async function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([p, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Map with at most `limit` calls in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class MetaService {
  constructor(
    private readonly deps: {
      stats: MetaStatsSource;
      lanes: PlayerLaneHistory;
      heroes: readonly MetaHero[];
    },
  ) {}

  /** The user's most-played position from their recent games with lane info. */
  async userRole(accountId32: number): Promise<Result<RoleView, SourceError>> {
    if (this.deps.heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    const res = await this.deps.lanes.recentLanes(accountId32);
    if (!res.ok) return res;
    const roles = new Map(this.deps.heroes.map((h) => [h.id, h.roles]));
    return ok({
      derivation: deriveRole(res.value.value.games, (id) => roles.get(id)),
      windowDays: res.value.value.windowDays,
      fetchedAt: res.value.fetchedAt,
    });
  }

  async topHeroes(position: Position): Promise<Result<TopHeroesView, SourceError>> {
    const { stats } = this.deps;
    if (this.deps.heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    // Start the tournament query right away; it runs alongside the public stats.
    const proPromise = stats.proDrafts();
    const pub = await stats.heroStats();
    if (!pub.ok) return pub;
    const publicStats = pub.value.value;
    if (publicStats.length === 0) return err({ type: "invalid_payload", cause: "no hero stats" });
    const byId = new Map(publicStats.map((s) => [s.heroId, s]));

    const ids = laneCandidates(position, this.deps.heroes, byId, LANE_CANDIDATES);
    const lanesPromise = mapLimit(ids, LANE_CONCURRENCY, (id) => stats.laneRoles(id));
    const [laneResults, proRes] = await Promise.all([
      withDeadline(lanesPromise, LANE_DEADLINE_MS),
      withDeadline(proPromise, PRO_DEADLINE_MS),
    ]);

    const lanes = new Map<number, LaneStats>();
    const laneTimes: Date[] = [];
    if (laneResults !== TIMEOUT) {
      laneResults.forEach((r, i) => {
        if (!r.ok) return;
        lanes.set(ids[i], r.value.value);
        laneTimes.push(r.value.fetchedAt);
      });
    }
    const laneStatus =
      lanes.size === ids.length ? "ok" : lanes.size === 0 ? "unavailable" : "partial";

    let pro: ProDrafts | null = null;
    let proSource: TopHeroesView["sources"]["pro"] = { status: "unavailable" };
    if (proRes !== TIMEOUT && proRes.ok) {
      const p = proRes.value.value;
      const fetchedAt = proRes.value.fetchedAt;
      if (p.drafts >= MIN_PRO_DRAFTS) {
        pro = p;
        proSource = { status: "ok", drafts: p.drafts, windowDays: p.windowDays, fetchedAt };
      } else {
        proSource = { status: "too_few", drafts: p.drafts, windowDays: p.windowDays, fetchedAt };
      }
    }

    const roles = new Map(this.deps.heroes.map((h) => [h.id, h.roles]));
    const ranked = rankHeroes(
      position,
      // A hero whose lane data failed can't be placed in a lane, so it's left out. Only when
      // no lane data came back at all do we rank on the rest (and the page says so).
      ids
        .filter((id) => laneStatus === "unavailable" || lanes.has(id))
        .map((id) => ({
          heroId: id,
          roles: roles.get(id) ?? [],
          publicStats: byId.get(id) ?? null,
          lanes: lanes.get(id) ?? null,
        })),
      { pro, allPicksTrend: totalPickTrend(publicStats) },
    );

    return ok({
      position,
      heroes: ranked.slice(0, TOP_HEROES),
      checked: ids.length,
      sources: {
        publicFetchedAt: pub.value.fetchedAt,
        lane: laneStatus,
        laneFetchedAt: laneTimes.length
          ? new Date(Math.min(...laneTimes.map((d) => d.getTime())))
          : null,
        pro: proSource,
      },
    });
  }

  async laneDuos(position: Position): Promise<Result<DuosView, SourceError>> {
    const solo = duosForPosition([], position);
    if (solo.kind === "solo_lane") return ok({ result: solo, windowDays: null, fetchedAt: null });
    const res = await this.deps.stats.proLaneDuos();
    if (!res.ok) return res;
    return ok({
      result: duosForPosition(res.value.value.rows, position),
      windowDays: res.value.value.windowDays,
      fetchedAt: res.value.fetchedAt,
    });
  }
}
