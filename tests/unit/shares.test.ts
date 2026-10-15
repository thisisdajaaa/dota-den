import { describe, expect, it, vi } from "vitest";
import { buildJourney } from "@/modules/mmr/domain/journey";
import {
  toJourneyShare,
  type JourneyShare,
  type SessionShare,
  type WeekShare,
} from "@/modules/shares/domain/share";
import type { ShareDocument } from "@/modules/shares/shares.model";
import type { SharesRepositoryPort } from "@/modules/shares/shares.ports";
import { SharesService } from "@/modules/shares/services/shares.service";

const owner = { userId: "u1", accountId32: 1 };
const session: SessionShare = {
  kind: "session",
  startedAt: new Date("2026-10-08T12:00:00Z"),
  endedAt: new Date("2026-10-08T15:00:00Z"),
  games: 4,
  wins: 3,
  losses: 1,
  heroes: [{ heroId: 2, games: 3, wins: 2 }],
  best: { heroId: 2, kills: 12, deaths: 1, assists: 9 },
};
const week = (games: number): WeekShare => ({
  kind: "week",
  from: "2026-10-05",
  to: "2026-10-11",
  games,
  wins: games,
  losses: 0,
  mostPlayed: null,
  best: null,
});

// MMR values no other number in the journey can collide with.
const MMR_VALUES = [4321, 4877, 4409];
const journey = (range: "3m" | "all" = "all") =>
  buildJourney({
    range,
    now: new Date("2026-10-16T12:00:00Z"),
    medals: [
      { rankTier: 52, observedAt: new Date("2026-06-01T00:00:00Z") },
      { rankTier: 54, observedAt: new Date("2026-08-01T00:00:00Z") },
      { rankTier: 53, observedAt: new Date("2026-09-15T00:00:00Z") },
    ],
    observations: MMR_VALUES.map((mmr, i) => ({
      observedAt: new Date(Date.UTC(2026, 6 + i, 10)),
      mmr,
    })),
    matches: [
      { startedAt: new Date("2026-07-01T00:00:00Z"), heroId: 7, result: "win", queueClass: "solo" },
      {
        startedAt: new Date("2026-09-01T00:00:00Z"),
        heroId: 8,
        result: "loss",
        queueClass: "solo",
      },
    ],
  });

/** Every key and number anywhere in a value. */
function walk(v: unknown, keys: string[] = [], numbers: number[] = []) {
  if (typeof v === "number") numbers.push(v);
  else if (Array.isArray(v)) v.forEach((x) => walk(x, keys, numbers));
  else if (v && typeof v === "object" && !(v instanceof Date))
    for (const [k, x] of Object.entries(v)) {
      keys.push(k);
      walk(x, keys, numbers);
    }
  return { keys, numbers };
}

function setup() {
  const docs = new Map<string, ShareDocument>();
  const repository: SharesRepositoryPort = {
    upsert: async (input, slug, now) => {
      const existing = [...docs.values()].find(
        (d) => d.userId === input.userId && d.kind === input.kind && d.ref === input.ref,
      );
      const doc = existing
        ? { ...existing, snapshot: input.snapshot, playerName: input.playerName, updatedAt: now }
        : { ...input, _id: slug, createdAt: now, updatedAt: now };
      docs.set(doc._id, doc);
      return doc;
    },
    find: async (slug) => docs.get(slug) ?? null,
    listForUser: async (userId) => [...docs.values()].filter((d) => d.userId === userId),
    remove: async (userId, slug) => docs.get(slug)?.userId === userId && docs.delete(slug),
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  let n = 0;
  const svc = new SharesService({
    repository,
    newSlug: () => `slug${String(++n).padStart(8, "0")}`,
    sources: {
      session: async (_o, id) => (id === "1:100" ? session : null),
      week: async () => week(5),
      journey: async (_o, range) => toJourneyShare(journey(range === "3m" ? "3m" : "all")),
      playerName: vi.fn(async () => "DAJA"),
    },
  });
  return { svc, docs };
}

describe("SharesService", () => {
  it("keeps one link per session, refreshing its snapshot", async () => {
    const { svc } = setup();
    const a = await svc.share(owner, { kind: "session", ref: "1:100" }, "Asia/Manila");
    const b = await svc.share(owner, { kind: "session", ref: "1:100" }, "Asia/Manila");
    expect(a.ok && b.ok && a.value._id === b.value._id).toBe(true);
    if (!a.ok) throw new Error();
    expect(a.value).toMatchObject({ kind: "session", ref: "1:100", playerName: "DAJA" });
    expect(a.value.snapshot).not.toHaveProperty("mmr");
  });

  it("refuses sessions that aren't the player's, and empty weeks", async () => {
    const { svc } = setup();
    expect(await svc.share(owner, { kind: "session", ref: "1:999" }, "UTC")).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
    const empty = new SharesService({
      repository: { upsert: vi.fn() } as unknown as SharesRepositoryPort,
      newSlug: () => "x",
      sources: {
        session: async () => null,
        week: async () => week(0),
        journey: async () =>
          toJourneyShare(
            buildJourney({
              range: "all",
              now: new Date(),
              medals: [],
              observations: [],
              matches: [],
            }),
          ),
        playerName: async () => null,
      },
    });
    expect(await empty.share(owner, { kind: "week" }, "UTC")).toEqual({
      ok: false,
      error: { type: "empty" },
    });
  });

  it("keys a week link by its first day, and only shows real slugs", async () => {
    const { svc } = setup();
    const res = await svc.share(owner, { kind: "week" }, "UTC");
    if (!res.ok) throw new Error();
    expect(res.value.ref).toBe("2026-10-05");
    expect(await svc.view(res.value._id)).not.toBeNull();
    expect(await svc.view("../etc")).toBeNull();
    expect(await svc.view("short")).toBeNull();
  });

  it("only lets the owner remove a link", async () => {
    const { svc } = setup();
    const res = await svc.share(owner, { kind: "week" }, "UTC");
    if (!res.ok) throw new Error();
    expect(await svc.revoke("someone-else", res.value._id)).toBe(false);
    expect(await svc.revoke("u1", res.value._id)).toBe(true);
    expect(await svc.view(res.value._id)).toBeNull();
  });

  it("shares a journey by medal only, one link per range", async () => {
    const { svc } = setup();
    const res = await svc.share(owner, { kind: "journey", range: "all" }, "UTC");
    if (!res.ok) throw new Error();
    expect(res.value).toMatchObject({ kind: "journey", ref: "all" });
    const snap = res.value.snapshot as JourneyShare;
    expect(snap.medals.map((m) => m.rankTier)).toEqual([52, 54, 53]);
    expect(snap.climb).toMatchObject({ fromTier: 52, toTier: 54, steps: 2, games: 1, wins: 1 });
    expect(snap.slide).toMatchObject({ fromTier: 54, toTier: 53, steps: -1, games: 1, wins: 0 });
    const again = await svc.share(owner, { kind: "journey", range: "3m" }, "UTC");
    expect(again.ok && again.value._id !== res.value._id).toBe(true);
  });

  it("never puts MMR in a journey share", () => {
    const j = journey();
    // The journey itself has logged MMR, a peak and MMR stretches...
    expect(j.mmr).toHaveLength(3);
    expect(j.mmrPeak?.mmr).toBe(4877);
    expect(j.mmrClimb).not.toBeNull();
    // ...and none of it reaches the snapshot.
    const snap = toJourneyShare(j);
    const { keys, numbers } = walk(snap);
    expect(keys.filter((k) => /mmr|gap|delta/i.test(k))).toEqual([]);
    for (const v of MMR_VALUES) expect(numbers).not.toContain(v);
    expect(Object.keys(snap).sort()).toEqual(
      [
        "kind",
        "range",
        "from",
        "to",
        "medals",
        "lastSeenAt",
        "peak",
        "low",
        "climb",
        "slide",
        "games",
        "wins",
        "losses",
        "heroes",
      ].sort(),
    );
  });

  it("refuses a journey with no medal yet", async () => {
    const empty = new SharesService({
      repository: { upsert: vi.fn() } as unknown as SharesRepositoryPort,
      newSlug: () => "x",
      sources: {
        session: async () => null,
        week: async () => week(0),
        journey: async () =>
          toJourneyShare(
            buildJourney({
              range: "all",
              now: new Date(),
              medals: [],
              observations: [],
              matches: [],
            }),
          ),
        playerName: async () => null,
      },
    });
    expect(await empty.share(owner, { kind: "journey", range: "6m" }, "UTC")).toEqual({
      ok: false,
      error: { type: "empty" },
    });
  });
});
