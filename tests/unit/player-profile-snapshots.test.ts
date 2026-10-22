import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import type { PlayerProfileSnapshot } from "@/modules/matches/domain/read-models";
import type { ProfileSnapshotStore, SavedProfile } from "@/modules/players/players.ports";
import {
  LAST_MATCH_MAX_AGE_MS,
  PlayersService,
  PROFILE_SNAPSHOT_MAX_AGE_MS,
} from "@/modules/players/services/players.service";

const now = new Date("2026-10-15T06:00:00Z");
const profile = (id: number, name: string): PlayerProfileSnapshot => ({
  accountId32: id,
  personaName: name,
  avatarUrl: "https://avatars.steamstatic.com/a.jpg",
  matchHistory: "full",
  rankTier: 55,
  leaderboardRank: null,
});

const lastPlayed = new Date("2026-10-14T20:00:00Z");

function setup(
  saved: SavedProfile[],
  failing: number[] = [],
  opts: { deferred?: boolean; follows?: number[] } = {},
) {
  const store = new Map(saved.map((s) => [s.accountId32, s]));
  const snapshots: ProfileSnapshotStore = {
    getMany: vi.fn(async (ids: readonly number[]) => {
      const out = new Map<number, SavedProfile>();
      for (const id of ids) if (store.has(id)) out.set(id, store.get(id)!);
      return out;
    }),
    save: vi.fn(
      async (p, at) =>
        void store.set(p.accountId32, { ...store.get(p.accountId32), ...p, fetchedAt: at }),
    ),
    saveLastMatch: vi.fn(async (id, at, fetchedAt) => {
      const s = store.get(id);
      if (s) store.set(id, { ...s, lastMatch: { at, fetchedAt } });
    }),
  };
  const fetchPlayerProfile = vi.fn(async (id: number) =>
    failing.includes(id) ? err({ type: "unavailable" as const }) : ok(profile(id, `fresh ${id}`)),
  );
  const lastMatchAt = vi.fn(async (_id: number) => ok(lastPlayed));
  // Tasks deferred until after the response; run them with `runDeferred`.
  const deferred: Array<() => Promise<void>> = [];
  const svc = new PlayersService({
    directory: { lastMatchAt } as never,
    profiles: { fetchPlayerProfile, recentMatches: vi.fn() } as never,
    follows: {
      list: async () =>
        (opts.follows ?? []).map((accountId32) => ({ accountId32, createdAt: now })),
    } as never,
    safeAvatar: (u) => u ?? null,
    snapshots,
    defer: opts.deferred ? (task) => void deferred.push(task) : undefined,
    logger: { warn: () => {} },
    now: () => now,
  });
  const runDeferred = async () => {
    for (const task of deferred.splice(0)) await task();
  };
  return { svc, snapshots, fetchPlayerProfile, lastMatchAt, store, deferred, runDeferred };
}

const owner = { userId: "u1", accountId32: 1 };
const old = new Date(now.getTime() - PROFILE_SNAPSHOT_MAX_AGE_MS - 1);

describe("public profile snapshots", () => {
  it("uses a recent saved copy without calling OpenDota", async () => {
    const { svc, fetchPlayerProfile } = setup([
      { ...profile(1, "saved"), fetchedAt: new Date(now.getTime() - 60_000) },
    ]);
    expect((await svc.publicProfile(1))?.personaName).toBe("saved");
    expect(fetchPlayerProfile).not.toHaveBeenCalled();
  });

  it("refreshes an old copy and saves the new one", async () => {
    const { svc, store } = setup([{ ...profile(1, "old"), fetchedAt: old }]);
    expect((await svc.publicProfile(1))?.personaName).toBe("fresh 1");
    expect(store.get(1)?.fetchedAt).toEqual(now);
  });

  it("falls back to the old copy when OpenDota fails, and null when there is none", async () => {
    const { svc } = setup([{ ...profile(1, "old"), fetchedAt: old }], [1, 2]);
    const got = await svc.publicProfiles([1, 2]);
    expect(got.get(1)?.personaName).toBe("old");
    expect(got.get(2)).toBeNull();
  });

  it("reads a whole list in one query and fetches only what's missing", async () => {
    const { svc, snapshots, fetchPlayerProfile } = setup([
      { ...profile(1, "a"), fetchedAt: now },
      { ...profile(2, "b"), fetchedAt: now },
    ]);
    const got = await svc.publicProfiles([1, 2, 3, 3]);
    expect([...got.keys()]).toEqual([1, 2, 3]);
    expect(snapshots.getMany).toHaveBeenCalledTimes(1);
    expect(fetchPlayerProfile).toHaveBeenCalledTimes(1);
    expect(fetchPlayerProfile).toHaveBeenCalledWith(3);
  });

  it("with a deferral, shows an old copy now and refreshes it after the response", async () => {
    const { svc, fetchPlayerProfile, store, deferred, runDeferred } = setup(
      [{ ...profile(1, "old"), fetchedAt: old }],
      [],
      { deferred: true },
    );
    const got = await svc.publicProfiles([1, 2]);
    expect(got.get(1)?.personaName).toBe("old");
    // Never saved: nothing to show, so that one is still fetched before returning.
    expect(got.get(2)?.personaName).toBe("fresh 2");
    expect(fetchPlayerProfile.mock.calls).toEqual([[2]]);
    expect(deferred).toHaveLength(1);
    await runDeferred();
    expect(fetchPlayerProfile).toHaveBeenCalledWith(1);
    expect(store.get(1)).toMatchObject({ personaName: "fresh 1", fetchedAt: now });
  });

  it("defers nothing when every saved copy is recent", async () => {
    const { svc, deferred } = setup([{ ...profile(1, "a"), fetchedAt: now }], [], {
      deferred: true,
    });
    await svc.publicProfiles([1]);
    expect(deferred).toHaveLength(0);
  });
});

describe("tracked players", () => {
  it("reads saved profiles and last matches in one query, without calling OpenDota", async () => {
    const { svc, snapshots, fetchPlayerProfile, lastMatchAt, deferred } = setup(
      [
        { ...profile(5, "five"), fetchedAt: now, lastMatch: { at: lastPlayed, fetchedAt: now } },
        { ...profile(6, "six"), fetchedAt: now, lastMatch: { at: null, fetchedAt: now } },
      ],
      [],
      { deferred: true, follows: [5, 6] },
    );
    const page = await svc.trackedPlayers(owner);
    expect(page.items.map((p) => [p.accountId32, p.personaName, p.lastMatchAt])).toEqual([
      [5, "five", lastPlayed],
      [6, "six", null],
    ]);
    expect(snapshots.getMany).toHaveBeenCalledTimes(1);
    expect(fetchPlayerProfile).not.toHaveBeenCalled();
    expect(lastMatchAt).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it("leaves unknown last matches unknown and looks them up after the response", async () => {
    const stale = new Date(now.getTime() - LAST_MATCH_MAX_AGE_MS);
    const { svc, lastMatchAt, store, runDeferred } = setup(
      [
        { ...profile(5, "five"), fetchedAt: now },
        { ...profile(6, "six"), fetchedAt: now, lastMatch: { at: null, fetchedAt: stale } },
      ],
      [],
      { deferred: true, follows: [5, 6] },
    );
    const page = await svc.trackedPlayers(owner);
    // undefined: never looked up, so the page doesn't claim "no recent matches".
    expect(page.items.map((p) => p.lastMatchAt)).toEqual([undefined, null]);
    expect(lastMatchAt).not.toHaveBeenCalled();
    await runDeferred();
    expect(lastMatchAt.mock.calls.map(([id]) => id)).toEqual([5, 6]);
    expect(store.get(5)?.lastMatch).toEqual({ at: lastPlayed, fetchedAt: now });
  });

  it("fetches only never-saved profiles before returning", async () => {
    const { svc, fetchPlayerProfile } = setup([{ ...profile(5, "five"), fetchedAt: old }], [], {
      deferred: true,
      follows: [5, 7],
    });
    const page = await svc.trackedPlayers(owner);
    expect(page.items.map((p) => p.personaName)).toEqual(["five", "fresh 7"]);
    expect(fetchPlayerProfile.mock.calls).toEqual([[7]]);
  });

  it("without a deferral, looks up missing last matches before returning", async () => {
    const { svc, lastMatchAt } = setup([{ ...profile(5, "five"), fetchedAt: now }], [], {
      follows: [5],
    });
    const page = await svc.trackedPlayers(owner);
    expect(page.items[0].lastMatchAt).toEqual(lastPlayed);
    expect(lastMatchAt).toHaveBeenCalledWith(5);
  });
});
