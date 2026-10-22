import { describe, expect, it, vi } from "vitest";
import { ok } from "@/common/result";
import type { Peer } from "@/modules/players/domain/public-player";
import { FriendsService } from "@/modules/together/services/friends.service";
import type { FriendsSources } from "@/modules/together/together.ports";

const ME = 1;

const peer = (accountId32: number, withGames: number): Peer => ({
  accountId32,
  personaName: `Peer ${accountId32}`,
  avatarUrl: null,
  withGames,
  withWins: Math.floor(withGames / 2),
  againstGames: 0,
  againstWins: 0,
  lastPlayedAt: null,
});

function setup(peers: Peer[], follows: number[]) {
  const publicProfiles = vi.fn(
    async (ids: readonly number[]) =>
      new Map(
        ids.map((id) => [
          id,
          { personaName: `Profile ${id}`, avatarUrl: null, rankTier: 55, leaderboardRank: null },
        ]),
      ),
  );
  const sources: FriendsSources = {
    directory: {
      peers: async () => ok(peers),
      winLoss: async () => ok({ wins: 50, losses: 50 }),
    },
    follows: { list: async () => follows.map((accountId32) => ({ accountId32 })) },
    profiles: { publicProfiles },
    ownFacts: async () => ({ facts: [] }),
    together: {
      overview: async () => ({
        partyGames: new Map(),
        trios: [],
        stacks: [],
        unknownPartyGames: 0,
      }),
      analysePair: vi.fn(),
    },
  };
  return {
    service: new FriendsService({ ...sources, logger: { warn: () => {} } }),
    publicProfiles,
  };
}

describe("FriendsService profile lookups", () => {
  it("looks up tracked players not already listed in one batch", async () => {
    const { service, publicProfiles } = setup([peer(2, 10)], [2, 3, 4, ME]);
    const { friends } = await service.candidates({ id: "u1", accountId32: ME });
    expect(publicProfiles).toHaveBeenCalledTimes(1);
    expect(publicProfiles).toHaveBeenCalledWith([3, 4]);
    expect(friends.find((f) => f.accountId32 === 3)).toMatchObject({
      personaName: "Profile 3",
      source: "tracked",
    });
  });

  it("looks up every listed teammate and rival in one batch", async () => {
    const { service, publicProfiles } = setup([peer(2, 30), peer(3, 20), peer(ME, 99)], []);
    const res = await service.teammatesOverview({ id: "u1", accountId32: ME });
    expect(res.ok).toBe(true);
    expect(publicProfiles).toHaveBeenCalledTimes(1);
    const [ids] = publicProfiles.mock.calls[0];
    expect([...ids].sort()).toEqual([2, 3]);
    if (res.ok)
      expect(res.value.teammates[0]).toMatchObject({ personaName: "Profile 2", rankTier: 55 });
  });
});
