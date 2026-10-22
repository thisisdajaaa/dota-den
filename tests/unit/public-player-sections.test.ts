import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import type { PlayerProfileSnapshot } from "@/modules/matches/domain/read-models";
import type { PlayerDirectory } from "@/modules/players/players.ports";
import { PlayersService } from "@/modules/players/services/players.service";

const profile: PlayerProfileSnapshot = {
  accountId32: 22202,
  personaName: "Fixture Hero",
  avatarUrl: "https://evil.example/a.jpg",
  matchHistory: "full",
  rankTier: 80,
  leaderboardRank: 1234,
};

/** A call that never answers. */
const never = <T>() => new Promise<T>(() => {});

function setup(directory: Partial<PlayerDirectory> = {}) {
  const warn = vi.fn();
  const svc = new PlayersService({
    directory: {
      winLoss: vi.fn(async () => ok({ wins: 7, losses: 5 })),
      heroes: vi.fn(async () => ok([])),
      peers: vi.fn(async () => ok([])),
      ...directory,
    } as unknown as PlayerDirectory,
    profiles: {
      fetchPlayerProfile: vi.fn(async () => ok(profile)),
      recentMatches: vi.fn(async () => ok([])),
    },
    follows: {} as never,
    safeAvatar: (u) => (u?.startsWith("https://avatars.steamstatic.com/") ? u : null),
    logger: { warn },
  });
  return { svc, warn };
}

describe("public player sections", () => {
  it("answers the profile without waiting for slow sections", async () => {
    const { svc } = setup({ peers: () => never(), heroes: () => never() });
    const sections = svc.publicPlayerSections(22202);
    const res = await sections.profile;
    expect(res.ok && res.value.personaName).toBe("Fixture Hero");
    // Other players' avatars are still filtered to Steam's CDN.
    expect(res.ok && res.value.avatarUrl).toBeNull();
    expect(await sections.record).toEqual(ok({ wins: 7, losses: 5 }));
  });

  it("turns a thrown section into an unavailable result and logs it", async () => {
    const { svc, warn } = setup({
      peers: async () => {
        throw new Error("boom");
      },
      heroes: async () => err({ type: "rate_limited" as const, retryAfterMs: null }),
    });
    const sections = svc.publicPlayerSections(22202);
    expect(await sections.peers).toEqual(err({ type: "unavailable", cause: "error" }));
    expect(await sections.heroes).toEqual(err({ type: "rate_limited", retryAfterMs: null }));
    expect(warn).toHaveBeenCalledWith(
      "player_peers_failed",
      expect.objectContaining({ accountId32: 22202, reason: "error" }),
    );
    expect(warn).toHaveBeenCalledWith("player_heroes_failed", {
      accountId32: 22202,
      reason: "rate_limited",
    });
  });

  it("still gives the whole view at once for the compare page", async () => {
    const { svc } = setup();
    const view = await svc.publicPlayer(22202);
    expect(view.profile.ok).toBe(true);
    expect(view.record).toEqual(ok({ wins: 7, losses: 5 }));
    expect(view.heroes).toEqual(ok([]));
    expect(view.peers).toEqual(ok([]));
    expect(view.matches).toEqual(ok([]));
  });
});
