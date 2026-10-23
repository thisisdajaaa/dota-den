import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportedPlayerMatch, StoredCoachReview } from "@/modules/matches/matches.ports";
import {
  CoachReviewsRepository,
  CoachUsageRepository,
  ParseRequestsRepository,
} from "@/modules/matches/repositories/match-coach.repository";
import {
  MATCH_COLLECTIONS,
  MatchFactsRepository,
} from "@/modules/matches/repositories/matches.repository";
import { toFact } from "@/modules/matches/services/match-sync.service";
import { SHEET } from "../support/coach-fixtures";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let reviews: CoachReviewsRepository;
let usage: CoachUsageRepository;
let parses: ParseRequestsRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  reviews = new CoachReviewsRepository(async () => db);
  usage = new CoachUsageRepository(async () => db);
  parses = new ParseRequestsRepository(async () => db);
  await Promise.all([
    reviews.ensureIndexes(),
    usage.ensureIndexes(),
    parses.ensureIndexes(),
    new MatchFactsRepository(async () => db).ensureIndexes(),
  ]);
});
afterAll(async () => teardown?.());

const DAY = 86_400_000;
const WEEK = 7 * DAY;

const review = (over: Partial<StoredCoachReview> = {}): StoredCoachReview => ({
  matchId: "7000000012",
  accountId32: 22202,
  model: "m1",
  promptVersion: "coach-v1",
  userId: "u-reviews",
  sheet: SHEET,
  points: [
    { kind: "strength", title: "Lane", detail: "48 last hits.", factKeys: ["lastHitsAt10"] },
  ],
  createdAt: new Date("2026-10-20T10:00:00Z"),
  ...over,
});

describe("CoachReviewsRepository", () => {
  it("keeps one review per match, player, model and prompt version", async () => {
    const key = {
      matchId: "7000000012",
      accountId32: 22202,
      model: "m1",
      promptVersion: "coach-v1",
    };
    expect(await reviews.get(key)).toBeNull();
    const first = review();
    expect(await reviews.save(first)).toEqual(first);
    // A second write for the same key (two tabs) returns the stored one.
    const second = review({ createdAt: new Date("2026-10-21T10:00:00Z") });
    expect((await reviews.save(second)).createdAt).toEqual(first.createdAt);
    expect(await reviews.get(key)).toEqual(first);
    // Another model or prompt version is a different review.
    expect(await reviews.get({ ...key, model: "m2" })).toBeNull();
    await reviews.save(review({ promptVersion: "coach-v2" }));
    expect(await reviews.get({ ...key, promptVersion: "coach-v2" })).not.toBeNull();
    const doc = await db.collection(MATCH_COLLECTIONS.coachReviews).findOne({});
    expect(doc).toMatchObject({ schemaVersion: 1 });
  });

  it("exports and deletes the owner's reviews only", async () => {
    await reviews.save(review({ accountId32: 1, userId: "u-other", matchId: "1" }));
    const owner = { userId: "u-reviews", accountId32: 22202 };
    const exported = await reviews.exportForOwner(owner);
    expect(exported).toHaveLength(2);
    expect(exported[0]).toMatchObject({ id: expect.stringContaining("7000000012:22202:m1:") });
    expect(exported[0]).not.toHaveProperty("schemaVersion");
    expect(await reviews.deleteForOwner(owner)).toBe(2);
    expect(await reviews.exportForOwner({ userId: "u-other", accountId32: 1 })).toHaveLength(1);
  });
});

describe("CoachUsageRepository", () => {
  const opts = (now: Date, matchId = "1") => ({
    matchId,
    now,
    limit: 1,
    windowMs: WEEK,
    holdMs: 3 * 60_000,
  });

  it("lets only one of many concurrent requests take the last free slot", async () => {
    const now = new Date("2026-10-23T12:00:00Z");
    for (let round = 0; round < 5; round++) {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, k) =>
          usage.reserve(`u-burst-${round}`, opts(now, String(k))),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    }
    const [a, b] = await Promise.all([
      usage.reserve("u-race", opts(now, "1")),
      usage.reserve("u-race", opts(now, "2")),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const won = (a.ok ? a : b) as { ok: true; id: string };
    // Holds don't count as uses until confirmed.
    expect(await usage.usesSince("u-race", new Date(now.getTime() - WEEK))).toEqual([]);
    await usage.confirm(won.id, now);
    expect(await usage.usesSince("u-race", new Date(now.getTime() - WEEK))).toEqual([now]);
    expect((await usage.reserve("u-race", opts(new Date(now.getTime() + DAY)))).ok).toBe(false);
  });

  it("frees the slot one window after the review, and when a hold is released", async () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const first = await usage.reserve("u-window", opts(now));
    expect(first.ok).toBe(true);
    await usage.confirm((first as { id: string }).id, now);
    const justBefore = new Date(now.getTime() + WEEK - 1);
    expect((await usage.reserve("u-window", opts(justBefore))).ok).toBe(false);
    const atEdge = new Date(now.getTime() + WEEK);
    const next = await usage.reserve("u-window", opts(atEdge));
    expect(next.ok).toBe(true);
    // Released (the review failed): the slot is free again at once.
    await usage.release((next as { id: string }).id);
    expect((await usage.reserve("u-window", opts(atEdge))).ok).toBe(true);
  });

  it("a stale hold (a crashed request) stops counting after its hold time", async () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect((await usage.reserve("u-stale", opts(now))).ok).toBe(true);
    expect((await usage.reserve("u-stale", opts(new Date(now.getTime() + 60_000)))).ok).toBe(false);
    expect((await usage.reserve("u-stale", opts(new Date(now.getTime() + 4 * 60_000)))).ok).toBe(
      true,
    );
  });

  it("exports used reviews (not holds) and deletes everything for the owner", async () => {
    const owner = { userId: "u-race", accountId32: 1 };
    const exported = await usage.exportForOwner(owner);
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ status: "used", matchId: expect.any(String) });
    expect(exported[0]).not.toHaveProperty("holdUntil");
    expect(await usage.deleteForOwner(owner)).toBe(1);
    const indexes = await db.collection(MATCH_COLLECTIONS.coachUsage).indexes();
    expect(indexes.find((i) => i.name === "ttl_expiresAt")).toMatchObject({
      expireAfterSeconds: 0,
    });
  });
});

describe("ParseRequestsRepository", () => {
  it("claims a match once until the claim expires or is released", async () => {
    const now = new Date("2026-10-23T12:00:00Z");
    expect(await parses.claim("555", now, DAY)).toBe(true);
    expect(await parses.claim("555", new Date(now.getTime() + 1_000), DAY)).toBe(false);
    // Expired but not yet swept by the TTL monitor.
    expect(await parses.claim("555", new Date(now.getTime() + DAY), DAY)).toBe(true);
    await parses.release("555");
    expect(await parses.claim("555", new Date(now.getTime() + DAY + 1), DAY)).toBe(true);
  });

  it("lists a player's recent unparsed games, newest first", async () => {
    const facts = new MatchFactsRepository(async () => db);
    const game = (matchId: string, day: number, parsed: boolean): ImportedPlayerMatch => ({
      accountId32: 33303,
      matchId,
      startedAt: new Date(Date.UTC(2026, 9, day)),
      durationSec: 2000,
      heroId: 1,
      side: "radiant",
      result: "win",
      kills: 1,
      deaths: 1,
      assists: 1,
      gameMode: 22,
      lobbyType: 7,
      role: null,
      partySize: null,
      averageRankTier: null,
      allyHeroIds: null,
      enemyHeroIds: null,
      provenance: {
        provider: "opendota",
        fetchedAt: new Date(),
        parseStatus: parsed ? "parsed" : "unparsed",
      },
    });
    await facts.upsertMany(
      [
        game("1", 10, false),
        game("2", 20, false),
        game("3", 21, true),
        game("4", 22, false),
        game("5", 23, false),
      ].map((m) => toFact(m, [])),
    );
    const since = new Date(Date.UTC(2026, 9, 16));
    expect(await parses.recentUnparsed(33303, since, 10)).toEqual(["5", "4", "2"]);
    expect(await parses.recentUnparsed(33303, since, 2)).toEqual(["5", "4"]);
    expect(await parses.recentUnparsed(33303, since, 0)).toEqual([]);
  });
});
