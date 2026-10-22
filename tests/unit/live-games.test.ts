import { describe, expect, it, vi } from "vitest";
import { LiveService } from "@/modules/live/live.service";
import { type LiveSource, type StreamDirectory } from "@/modules/live/live.ports";
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

/** A streaming site with these live Dota 2 streams (null: the site isn't answering). */
const site = (titles: string[] | null): StreamDirectory => ({
  platform: "twitch",
  liveDotaStreams: async () =>
    titles?.map((title, i) => ({
      platform: "twitch" as const,
      channel: `caster${i}`,
      userId: String(i + 1),
      displayName: `Caster${i}`,
      title,
      viewers: 100,
      language: "en",
      thumbnailUrl: null,
      avatarUrl: null,
      startedAt: null,
    })) ?? null,
  searchChannels: async () => null,
  liveByChannels: async () => null,
  channelById: async () => ({ status: "unavailable" as const }),
});

describe("LiveService", () => {
  const source: LiveSource = {
    games: async () => [
      game({ matchId: "9", leagueId: 7, teams: { radiant: "Team Falcons", dire: "Tundra" } }),
      game({ matchId: "7", leagueId: 8, teams: { radiant: "Nobody Streams", dire: "Us" } }),
      game({ matchId: "8", averageMmr: 8_000 }),
    ],
    leagueName: vi.fn(async () => "Fixture Major"),
  };

  it("lists only games someone is streaming, with league names", async () => {
    const svc = new LiveService({ source, directories: [site(["LIVE: Falcons vs Tundra"])] });
    const o = await svc.overview();
    expect(o?.streamsKnown).toBe(true);
    expect(o?.league.map((g) => g.matchId)).toEqual(["9"]);
    expect(o?.league[0].leagueName).toBe("Fixture Major");
    // No stream mentions the public game: it isn't listed.
    expect(o?.topPublic).toEqual([]);
    expect((await svc.game("9"))?.leagueName).toBe("Fixture Major");
    expect(await svc.game("404")).toBeNull();
  });

  it("lists nothing, and says so, when no streaming site answers", async () => {
    const svc = new LiveService({ source, directories: [site(null)] });
    expect(await svc.overview()).toMatchObject({ league: [], topPublic: [], streamsKnown: false });
  });

  it("is null when the feed is down", async () => {
    const svc = new LiveService({
      source: { games: async () => null, leagueName: async () => null },
    });
    expect(await svc.overview()).toBeNull();
  });
});
