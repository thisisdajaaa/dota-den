import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import type { PlayerProfileSnapshot } from "@/modules/matches/domain/read-models";
import type { ProfileSnapshotStore } from "@/modules/players/players.ports";
import {
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

function setup(saved: Array<PlayerProfileSnapshot & { fetchedAt: Date }>, failing: number[] = []) {
  const store = new Map(saved.map((s) => [s.accountId32, s]));
  const snapshots: ProfileSnapshotStore = {
    getMany: vi.fn(async (ids: readonly number[]) => {
      const out = new Map<number, PlayerProfileSnapshot & { fetchedAt: Date }>();
      for (const id of ids) if (store.has(id)) out.set(id, store.get(id)!);
      return out;
    }),
    save: vi.fn(async (p, at) => void store.set(p.accountId32, { ...p, fetchedAt: at })),
  };
  const fetchPlayerProfile = vi.fn(async (id: number) =>
    failing.includes(id) ? err({ type: "unavailable" as const }) : ok(profile(id, `fresh ${id}`)),
  );
  const svc = new PlayersService({
    directory: {} as never,
    profiles: { fetchPlayerProfile, recentMatches: vi.fn() } as never,
    follows: {} as never,
    safeAvatar: (u) => u ?? null,
    snapshots,
    logger: { warn: () => {} },
    now: () => now,
  });
  return { svc, snapshots, fetchPlayerProfile, store };
}

describe("public profile snapshots", () => {
  it("uses a recent saved copy without calling OpenDota", async () => {
    const { svc, fetchPlayerProfile } = setup([
      { ...profile(1, "saved"), fetchedAt: new Date(now.getTime() - 60_000) },
    ]);
    expect((await svc.publicProfile(1))?.personaName).toBe("saved");
    expect(fetchPlayerProfile).not.toHaveBeenCalled();
  });

  it("refreshes an old copy and saves the new one", async () => {
    const old = new Date(now.getTime() - PROFILE_SNAPSHOT_MAX_AGE_MS - 1);
    const { svc, store } = setup([{ ...profile(1, "old"), fetchedAt: old }]);
    expect((await svc.publicProfile(1))?.personaName).toBe("fresh 1");
    expect(store.get(1)?.fetchedAt).toEqual(now);
  });

  it("falls back to the old copy when OpenDota fails, and null when there is none", async () => {
    const old = new Date(now.getTime() - PROFILE_SNAPSHOT_MAX_AGE_MS - 1);
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
});
