import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { summarizeMatches } from "@/modules/matches/domain/match-summary";
import type { DashboardFilter } from "@/modules/matches/domain/read-models";
import {
  MatchReadRepository,
  SUMMARY_FACT_PROJECTION,
  type PlayerMatchFactDoc,
} from "@/modules/matches/repositories/matches.repository";

vi.mock("server-only", () => ({}));

const ME = 42;
const now = new Date("2026-10-20T12:00:00Z");
const DAY = 86_400_000;

type Doc = Record<string, unknown>;

function get(doc: Doc, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v as Doc | undefined)?.[k], doc);
}

function matches(doc: Doc, query: Doc): boolean {
  return Object.entries(query).every(([path, cond]) => {
    const v = get(doc, path);
    if (cond && typeof cond === "object" && "$gte" in cond)
      return (v as Date).getTime() >= ((cond as { $gte: Date }).$gte as Date).getTime();
    return v === cond;
  });
}

/** Inclusion projections with dotted paths, as MongoDB applies them. */
function project(doc: Doc, projection: Doc | undefined): Doc {
  if (!projection) return structuredClone(doc);
  const out: Doc = {};
  for (const [path, on] of Object.entries(projection)) {
    if (!on || path === "_id") continue;
    const v = get(doc, path);
    if (v === undefined) continue;
    const keys = path.split(".");
    let at = out;
    for (const k of keys.slice(0, -1)) at = (at[k] ??= {}) as Doc;
    at[keys[keys.length - 1]] = structuredClone(v);
  }
  return out;
}

/** Just enough of a MongoDB collection for the read repository's dashboard queries. */
function fakeDb(docs: PlayerMatchFactDoc[]) {
  const projections: Doc[] = [];
  const collection = {
    find: (query: Doc, opts: { limit?: number; projection?: Doc } = {}) => ({
      toArray: async () => {
        if (opts.projection) projections.push(opts.projection);
        return (docs as unknown as Doc[])
          .filter((d) => matches(d, query))
          .sort((a, b) => (b.startedAt as Date).getTime() - (a.startedAt as Date).getTime())
          .slice(0, opts.limit ?? Infinity)
          .map((d) => project(d, opts.projection));
      },
    }),
    findOne: async (query: Doc, opts: { projection?: Doc } = {}) => {
      const [first] = await collection.find(query, { ...opts, limit: 1 }).toArray();
      return first ?? null;
    },
  };
  const db = { collection: () => collection } as unknown as Db;
  return { db, projections };
}

function fact(i: number): PlayerMatchFactDoc {
  const queue =
    i % 5 === 0
      ? { queueClass: "unknown" as const, partySize: null, confidence: "none" as const }
      : i % 3 === 0
        ? { queueClass: "party" as const, partySize: 2 + (i % 4), confidence: "high" as const }
        : { queueClass: "solo" as const, partySize: 1, confidence: "high" as const };
  return {
    accountId32: ME,
    matchId: String(8_000_000_000 + i),
    startedAt: new Date(now.getTime() - i * 0.37 * DAY),
    durationSec: 1_800 + i * 7,
    heroId: 1 + (i % 17),
    side: i % 2 ? "radiant" : "dire",
    result: i % 3 === 1 ? "loss" : "win",
    kills: i % 13,
    deaths: i % 9,
    assists: i % 21,
    gameMode: 22,
    lobbyType: i % 4 === 0 ? 0 : 7,
    ranked: i % 4 !== 0,
    role: null,
    queue: { ...queue, reason: "party_size_reported" },
    patch: {
      patch: i < 40 ? "7.39d" : "7.39c",
      certainty: i === 39 ? "boundary" : "confident",
    },
    averageRankTier: null,
    allyHeroIds: [1, 2, 3, 4],
    enemyHeroIds: [5, 6, 7, 8, 9],
    provenance: { provider: "opendota", fetchedAt: now, parseStatus: "unknown" },
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
  };
}

const FILTERS: DashboardFilter[] = [
  { range: "all", mode: "all" },
  { range: "all", mode: "ranked" },
  { range: "30d", mode: "all" },
  { range: "patch", mode: "ranked" },
];

describe("dashboard view", () => {
  // Shuffled, so order comes from the query's sort and not the insert order.
  const docs = Array.from({ length: 150 }, (_, i) => fact((i * 61) % 150));

  it.each(FILTERS)("summarizes exactly like the full rows (%o)", async (filter) => {
    const repo = new MatchReadRepository(async () => fakeDb(docs).db);
    const full = await repo.dashboardFacts(ME, filter, now);
    const view = await repo.dashboardView(ME, filter, now, 12);

    expect(full.facts.length).toBeGreaterThan(12);
    expect(view.facts).toHaveLength(full.facts.length);
    const opts = { topHeroes: Number.POSITIVE_INFINITY };
    expect(summarizeMatches(view.facts, opts)).toEqual(summarizeMatches(full.facts, opts));
    expect(view.recent).toEqual(full.facts.slice(0, 12));
    expect(view.latestPatch).toBe(full.latestPatch);
    expect(view.latestPatch).toBe("7.39d");
  });

  it("reads only the summary's fields for the summary rows", async () => {
    const { db, projections } = fakeDb(docs);
    const view = await new MatchReadRepository(async () => db).dashboardView(
      ME,
      { range: "all", mode: "all" },
      now,
      12,
    );
    expect(projections).toContainEqual(SUMMARY_FACT_PROJECTION);
    expect(Object.keys(view.facts[0]).sort()).toEqual(
      [
        "assists",
        "deaths",
        "heroId",
        "kills",
        "matchId",
        "partySize",
        "queueClass",
        "result",
        "startedAt",
      ].sort(),
    );
  });

  it("keeps a missing party size unknown, never solo", async () => {
    const repo = new MatchReadRepository(async () => fakeDb(docs).db);
    const view = await repo.dashboardView(ME, { range: "all", mode: "all" }, now, 12);
    const unknown = view.facts.filter((f) => f.queueClass === "unknown");
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.every((f) => f.partySize === null)).toBe(true);
  });

  it("reads the latest patch alongside the games, not before them", async () => {
    const { db } = fakeDb(docs);
    const col = db.collection("player_match_facts") as unknown as {
      find: (...a: unknown[]) => { toArray: () => Promise<Doc[]> };
      findOne: (...a: unknown[]) => Promise<Doc | null>;
    };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const findOne = col.findOne;
    col.findOne = async (...a) => {
      await gate;
      return findOne(...a);
    };
    const find = vi.spyOn(col, "find");
    const pending = new MatchReadRepository(async () => db).dashboardView(
      ME,
      { range: "all", mode: "all" },
      now,
      12,
    );
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(2));
    release();
    expect((await pending).latestPatch).toBe("7.39d");
  });
});
