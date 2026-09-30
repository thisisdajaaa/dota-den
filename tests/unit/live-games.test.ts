import { describe, expect, it, vi } from "vitest";
import { LiveService, type LiveSource } from "@/modules/live/application/live-service";
import {
  clock,
  draftComplete,
  leadText,
  sideHeroes,
  splitLive,
  type LiveGame,
} from "@/modules/live/domain/live-game";

const game = (over: Partial<LiveGame> = {}): LiveGame => ({
  matchId: "1",
  leagueId: null,
  leagueName: null,
  teams: { radiant: null, dire: null },
  score: { radiant: 0, dire: 0 },
  radiantLead: 0,
  gameTimeSec: 0,
  delaySec: 0,
  averageMmr: null,
  spectators: 0,
  players: [],
  updatedAt: new Date(0),
  ...over,
});
const players = (heroes: number[]) =>
  heroes.map((heroId, i) => ({
    accountId32: i,
    name: null,
    heroId,
    side: (i < 5 ? "radiant" : "dire") as "radiant" | "dire",
    isPro: false,
  }));

describe("live game helpers", () => {
  it("splits league games (most watched first) from the top public games by MMR", () => {
    const res = splitLive([
      game({ matchId: "a", leagueId: 1, spectators: 5 }),
      game({ matchId: "b", leagueId: 2, spectators: 50 }),
      game({ matchId: "c", averageMmr: 7_000 }),
      game({ matchId: "d", averageMmr: 8_000 }),
      game({ matchId: "e" }),
    ]);
    expect(res.league.map((g) => g.matchId)).toEqual(["b", "a"]);
    expect(res.topPublic.map((g) => g.matchId)).toEqual(["d", "c"]);
  });

  it("knows when the draft is complete and who leads", () => {
    const full = game({ players: players([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) });
    expect(draftComplete(full)).toBe(true);
    expect(sideHeroes(full, "dire")).toEqual([6, 7, 8, 9, 10]);
    expect(draftComplete(game({ players: players([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) }))).toBe(false);
    expect(leadText(game({ radiantLead: -34_311 }))).toBe("Dire leads by 34.3k gold");
    expect(leadText(game({ radiantLead: 200 }))).toBe("Net worth even");
    expect(clock(2_518)).toBe("41:58");
  });
});

describe("LiveService", () => {
  it("adds league names and finds one game", async () => {
    const source: LiveSource = {
      games: async () => [
        game({ matchId: "9", leagueId: 7 }),
        game({ matchId: "8", averageMmr: 8_000 }),
      ],
      leagueName: vi.fn(async () => "Fixture Major"),
    };
    const svc = new LiveService({ source });
    const o = await svc.overview();
    expect(o?.league[0].leagueName).toBe("Fixture Major");
    expect((await svc.game("9"))?.leagueName).toBe("Fixture Major");
    expect(await svc.game("404")).toBeNull();
  });

  it("is null when the feed is down", async () => {
    const svc = new LiveService({
      source: { games: async () => null, leagueName: async () => null },
    });
    expect(await svc.overview()).toBeNull();
  });
});
