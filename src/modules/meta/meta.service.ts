import type { Logger } from "@/common/logging/logger";
import { mapLimit } from "@/common/utils/map-limit";
import { heroPatchChanges } from "./domain/patch-tips";
import { err, ok, type Result } from "@/common/result";
import { duosForPosition } from "./domain/lane-duos";
import {
  laneCandidates,
  rankHeroes,
  totalPickTrend,
  MIN_PRO_DRAFTS,
  type LaneStats,
  type ProDrafts,
} from "./domain/meta-stats";
import { deriveRole, type Position } from "./domain/position";
import type { MetaHero, MetaStatsSource, PlayerLaneHistory, SourceError } from "./meta.ports";
import type { LatestPatchResult, LatestPatchSource } from "./meta.ports";
import type { DuosView, RoleView, TopHeroesView } from "./dtos/responses/meta.dto";

/** How many heroes to fetch lane data for per position (upstream calls are bounded). */
export const LANE_CANDIDATES = 28;
export const LANE_CONCURRENCY = 4;
export const TOP_HEROES = 10;
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

export class MetaService {
  constructor(
    private readonly deps: {
      stats: MetaStatsSource;
      lanes: PlayerLaneHistory;
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

  async topHeroes(position: Position): Promise<Result<TopHeroesView, SourceError>> {
    const { stats } = this.deps;
    const heroes = await this.deps.heroes();
    if (heroes.length === 0) return err({ type: "unavailable", cause: "hero catalog" });
    // Start the tournament query right away; it runs alongside the public stats.
    const proPromise = stats.proDrafts();
    const pub = await stats.heroStats();
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
    const [drafts, duos] = await Promise.all([
      stats.proDrafts().catch(() => null),
      stats.proLaneDuos().catch(() => null),
    ]);
    return [
      { key: "proDrafts", ok: drafts?.ok ?? false },
      { key: "proLaneDuos", ok: duos?.ok ?? false },
    ];
  }
}
