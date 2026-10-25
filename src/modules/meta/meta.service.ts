import type { Logger } from "@/common/logging/logger";
import { mapLimit } from "@/common/utils/map-limit";
import { heroPatchChanges } from "./domain/patch-tips";
import { err, ok, type Result } from "@/common/result";
import { duosForPosition } from "./domain/lane-duos";
import {
  laneCandidates,
  mostContested,
  overviewPools,
  rankByPosition,
  rankHeroes,
  totalPickTrend,
  MIN_PRO_DRAFTS,
  type HeroPublicStats,
  type LaneStats,
  type ProDrafts,
  type RankedHero,
} from "./domain/meta-stats";
import { deriveRole, POSITIONS, type Position } from "./domain/position";
import type { PositionStats } from "./domain/position-stats";
import type {
  Fetched,
  MetaHero,
  MetaStatsSource,
  PlayerLaneHistory,
  PositionStatsSource,
  SourceError,
  SourceResult,
} from "./meta.ports";
import type { LatestPatchResult, LatestPatchSource } from "./meta.ports";
import type {
  ContestedView,
  DuosView,
  OverviewView,
  RoleView,
  TopHeroesView,
} from "./dtos/responses/meta.dto";

/** How many heroes to fetch lane data for per position (upstream calls are bounded). */
export const LANE_CANDIDATES = 28;
export const LANE_CONCURRENCY = 4;
export const TOP_HEROES = 10;
/** Heroes per pool in the overview (shown before a role is picked, and on the home page). */
export const OVERVIEW_HEROES = 3;
/** Tournament data is a bonus: don't hold the hero list back for it longer than this. */
export const PRO_DEADLINE_MS = 8_000;
export const LANE_DEADLINE_MS = 12_000;

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

/** Tournament data to rank with, and how to describe it (too few drafts are shown, not used). */
function proUse(proRes: Result<Fetched<ProDrafts>, SourceError> | typeof TIMEOUT): {
  pro: ProDrafts | null;
  proSource: TopHeroesView["sources"]["pro"];
} {
  if (proRes === TIMEOUT || !proRes.ok) return { pro: null, proSource: { status: "unavailable" } };
  const p = proRes.value.value;
  const fetchedAt = proRes.value.fetchedAt;
  return p.drafts >= MIN_PRO_DRAFTS
    ? { pro: p, proSource: { status: "ok", drafts: p.drafts, windowDays: p.windowDays, fetchedAt } }
    : {
        pro: null,
        proSource: { status: "too_few", drafts: p.drafts, windowDays: p.windowDays, fetchedAt },
      };
}

export class MetaService {
  constructor(
    private readonly deps: {
      stats: MetaStatsSource;
      lanes: PlayerLaneHistory;
      /**
       * Per-position public stats (STRATZ), or null when not configured; read on each use so
       * building the service never reads the environment. When they answer they decide which
       * heroes play each position; otherwise lane data and catalog roles do, as before.
       */
      positions?: () => PositionStatsSource | null;
      /** The hero catalog (ids and roles). */
      heroes: () => Promise<readonly MetaHero[]>;
      /** The newest imported patch, for the patch tips (from the patches feature). */
      patches?: LatestPatchSource;
      logger?: Pick<Logger, "warn">;
    },
  ) {}

  /** The user's most-played position from their recent games with lane info. */
  async userRole(accountId32: number): Promise<Result<RoleView, SourceError>> {
    const heroes = await this.deps.heroes();
    if (heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    const res = await this.deps.lanes.recentLanes(accountId32);
    if (!res.ok) return res;
    const roles = new Map(heroes.map((h) => [h.id, h.roles]));
    return ok({
      derivation: deriveRole(res.value.value.games, (id) => roles.get(id)),
      windowDays: res.value.value.windowDays,
      fetchedAt: res.value.fetchedAt,
    });
  }

  /**
   * Each hero's share of its high-rank games at each position (STRATZ, 0..1), or null when
   * position stats aren't available. For other features (the draft helper's position filter).
   */
  async positionShares(): Promise<ReadonlyMap<number, Record<Position, number>> | null> {
    const stats = await this.positionStats();
    if (stats.status !== "ok") return null;
    const out = new Map<number, Record<Position, number>>();
    for (const [heroId, counts] of stats.value.value.heroes) {
      const total = POSITIONS.reduce((n, p) => n + counts[p].games, 0);
      if (total === 0) continue;
      out.set(
        heroId,
        Object.fromEntries(POSITIONS.map((p) => [p, counts[p].games / total])) as Record<
          Position,
          number
        >,
      );
    }
    return out;
  }

  /** STRATZ position stats, or the reason they can't be used ("off" without a source). */
  private async positionStats(): Promise<
    | { status: "ok"; value: Fetched<PositionStats> }
    | { status: "unavailable" | "off"; value?: undefined }
  > {
    const source = this.deps.positions?.() ?? null;
    if (!source) return { status: "off" };
    try {
      const res = await source.positionStats();
      if (res.ok) return { status: "ok", value: res.value };
      this.deps.logger?.warn("meta_position_stats_unavailable", { reason: res.error.type });
    } catch (e) {
      this.deps.logger?.warn("meta_position_stats_unavailable", { error: e });
    }
    return { status: "unavailable" };
  }

  async topHeroes(position: Position): Promise<Result<TopHeroesView, SourceError>> {
    const res = await this.rank(position);
    return res.ok ? ok(res.value.view) : res;
  }

  /**
   * One position's ranking: the view (top 10) and, when STRATZ placed the heroes, every hero
   * that qualified (the overview needs them all to fill each pool with heroes that belong).
   */
  private async rank(
    position: Position,
  ): Promise<Result<{ view: TopHeroesView; all: RankedHero[] }, SourceError>> {
    const { stats } = this.deps;
    // Start the tournament query and public stats right away; they run alongside the rest.
    const proPromise = stats.proDrafts();
    const pubPromise = stats.heroStats();
    const positions = await this.positionStats();
    if (positions.status === "ok")
      return this.rankFromPositions(position, positions.value, pubPromise, proPromise);

    const heroes = await this.deps.heroes();
    if (heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    const pub = await pubPromise;
    if (!pub.ok) return pub;
    const publicStats = pub.value.value;
    if (publicStats.length === 0) return err({ type: "invalid_payload", cause: "no hero stats" });
    const byId = new Map(publicStats.map((s) => [s.heroId, s]));

    const ids = laneCandidates(position, heroes, byId, LANE_CANDIDATES);
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

    const { pro, proSource } = proUse(proRes);

    const roles = new Map(heroes.map((h) => [h.id, h.roles]));
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

    const view: TopHeroesView = {
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
        positions: { status: positions.status },
      },
    };
    // Lane mode keeps today's overview: built from each position's top 10.
    return ok({ view, all: view.heroes });
  }

  /**
   * Rank from STRATZ position stats: no lane lookups, no catalog roles. OpenDota's hero stats
   * (pick trends, high-rank record) and tournament data are added when they answer.
   */
  private async rankFromPositions(
    position: Position,
    positions: Fetched<PositionStats>,
    pubPromise: SourceResult<HeroPublicStats[]>,
    proPromise: SourceResult<ProDrafts>,
  ): Promise<Result<{ view: TopHeroesView; all: RankedHero[] }, SourceError>> {
    const [pub, proRes] = await Promise.all([
      pubPromise.catch(() => null),
      withDeadline(proPromise, PRO_DEADLINE_MS),
    ]);
    const publicStats = pub?.ok ? pub.value.value : [];
    const { pro, proSource } = proUse(proRes);
    const ranked = rankByPosition(position, positions.value, {
      publicStats: new Map(publicStats.map((s) => [s.heroId, s])),
      pro,
      allPicksTrend: totalPickTrend(publicStats),
    });
    const view: TopHeroesView = {
      position,
      heroes: ranked.slice(0, TOP_HEROES),
      checked: ranked.length,
      sources: {
        publicFetchedAt: pub?.ok ? pub.value.fetchedAt : null,
        lane: "not_used",
        laneFetchedAt: null,
        pro: proSource,
        positions: {
          status: "ok",
          fetchedAt: positions.fetchedAt,
          window: positions.value.window,
        },
      },
    };
    return ok({ view, all: ranked });
  }

  /**
   * Best heroes per pool from the same lane-checked ranking as a picked role, so a hero sits
   * where it's actually played (role tags call Outworld Devourer a carry; lane data says mid).
   * Lane data is cached per hero for a day and warmed by the daily job, so this is cache reads.
   */
  async overview(limit = OVERVIEW_HEROES): Promise<Result<OverviewView, SourceError>> {
    const results = await Promise.all(POSITIONS.map((p) => this.rank(p)));
    const positions = await this.positionStats();
    const byPosition = new Map<Position, RankedHero[]>();
    let fetchedAt: Date | null = null;
    let fromPositions: Extract<TopHeroesView["sources"]["positions"], { status: "ok" }> | null =
      null;
    let ranked = 0;
    for (const [i, p] of POSITIONS.entries()) {
      const r = results[i];
      if (!r.ok) continue;
      ranked++;
      byPosition.set(p, r.value.all);
      const src = r.value.view.sources.positions;
      if (src.status === "ok") fromPositions ??= src;
      fetchedAt ??= src.status === "ok" ? src.fetchedAt : r.value.view.sources.publicFetchedAt;
    }
    if (ranked === 0) return results[0] as Result<never, SourceError>;
    if (fetchedAt === null) return err({ type: "unavailable", cause: "no ranking source" });
    const shares = fromPositions && positions.status === "ok" ? positions.value.value : null;
    return ok({
      pools: overviewPools(byPosition, limit, shares),
      fetchedAt,
      positions: shares && fromPositions ? { window: fromPositions.window } : null,
    });
  }

  /** The heroes most picked or banned in recent tournaments (one cached explorer query). */
  async contested(limit = OVERVIEW_HEROES): Promise<Result<ContestedView, SourceError>> {
    const res = await this.deps.stats.proDrafts();
    if (!res.ok) return res;
    const p = res.value.value;
    return ok({
      status: p.drafts >= MIN_PRO_DRAFTS ? "ok" : "too_few",
      heroes: p.drafts >= MIN_PRO_DRAFTS ? mostContested(p, limit) : [],
      drafts: p.drafts,
      windowDays: p.windowDays,
      fetchedAt: res.value.fetchedAt,
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

  /** The newest imported patch with its hero changes. Never throws. */
  async latestPatch(): Promise<LatestPatchResult> {
    try {
      const patch = await this.deps.patches?.latest();
      if (!patch) return { status: "none" };
      return {
        status: "ok",
        patch: {
          version: patch.version,
          publishedAt: patch.publishedAt,
          heroes: heroPatchChanges(patch),
        },
      };
    } catch (e) {
      this.deps.logger?.warn("meta_patch_unavailable", { error: e });
      return { status: "unavailable" };
    }
  }

  /**
   * Run the Meta page's slow tournament queries so their results are cached (in Redis, for
   * every server) before anyone asks. Called by the daily cron. Never throws.
   */
  async warmCaches(): Promise<Array<{ key: string; ok: boolean }>> {
    const { stats } = this.deps;
    const [drafts, duos, positions] = await Promise.all([
      stats.proDrafts().catch(() => null),
      stats.proLaneDuos().catch(() => null),
      // STRATZ position stats (one call, from the member budget), cached for every server.
      this.positionStats(),
    ]);
    // Every position's ranking. With STRATZ answering this needs no lane data; without it,
    // every position's lane data (about 130 heroes, once a day, from the member budget), so
    // the overview and role pages read a warm cache instead of making visitors wait.
    const lanes = [];
    for (const p of POSITIONS) lanes.push(await this.topHeroes(p).catch(() => null));
    return [
      { key: "proDrafts", ok: drafts?.ok ?? false },
      { key: "proLaneDuos", ok: duos?.ok ?? false },
      ...(positions.status === "off"
        ? []
        : [{ key: "positionStats", ok: positions.status === "ok" }]),
      {
        key: "laneRoles",
        ok: lanes.every(
          (r) =>
            r?.ok === true &&
            (r.value.sources.lane === "ok" || r.value.sources.lane === "not_used"),
        ),
      },
    ];
  }
}
