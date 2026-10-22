import { describe, expect, it } from "vitest";
import type { LiveGame } from "@/modules/live/domain/live-game";
import type { Platform } from "@/modules/live/domain/platform";
import type { ChannelHit } from "@/modules/live/domain/streams";
import type { LiveStream } from "@/modules/live/domain/watch";
import type { LiveSource, StreamDirectory } from "@/modules/live/live.ports";
import { LiveService } from "@/modules/live/live.service";

const game: LiveGame = {
  matchId: "8000000001",
  leagueId: 7,
  leagueName: null,
  teams: { radiant: "Fixture Falcons", dire: "Fixture Titans" },
  score: { radiant: 0, dire: 0 },
  radiantLead: 0,
  gameTimeSec: 0,
  delaySec: 0,
  averageMmr: null,
  spectators: 10,
  players: [],
  updatedAt: new Date(0),
};
const source: LiveSource = { games: async () => [game], leagueName: async () => "Fixture Cup" };
const stream = (
  channel: string,
  title: string,
  viewers: number,
  platform: Platform = "twitch",
): LiveStream => ({ platform, channel, displayName: channel, title, viewers, language: "en" });
const hit = (login: string, live: boolean, platform: Platform = "twitch"): ChannelHit => ({
  platform,
  id: login,
  login,
  displayName: login,
  avatarUrl: null,
  live,
  title: "",
  gameName: null,
  language: null,
});

function directory(platform: Platform, over: Partial<StreamDirectory> = {}): StreamDirectory {
  return {
    platform,
    liveDotaStreams: async () =>
      platform === "twitch"
        ? [stream("small", "Fixture Cup day 1", 5), stream("big", "chill pubs", 500)]
        : [stream("kickpro", "Fixture Falcons vs Fixture Titans", 80, "kick")],
    searchChannels: async () =>
      platform === "twitch"
        ? [hit("off", false), hit("on", true)]
        : [hit("kickoff", false, "kick"), hit("kickon", true, "kick")],
    liveByChannels: async () => new Map(),
    channelById: async () => ({ status: "not_found" }),
    ...over,
  };
}

describe("LiveService watch hub", () => {
  it("lists streams most watched first, with game guesses from titles", async () => {
    const service = new LiveService({ source, directories: [directory("twitch")] });
    const hub = await service.hub();
    expect(hub.streams?.map((s) => s.channel)).toEqual(["big", "small"]);
    // The league name is looked up before matching titles.
    expect(hub.hints).toEqual({
      "twitch:small": expect.objectContaining({
        matchId: "8000000001",
        mentions: ["Fixture Cup"],
      }),
    });
  });

  it("merges every site's streams and guesses, and survives one site being down", async () => {
    const both = new LiveService({
      source,
      directories: [directory("twitch"), directory("kick")],
    });
    expect(both.platforms).toEqual(["twitch", "kick"]);
    const hub = await both.hub();
    expect(hub.streams?.map((s) => `${s.platform}:${s.channel}`)).toEqual([
      "twitch:big",
      "kick:kickpro",
      "twitch:small",
    ]);
    expect(Object.keys(hub.hints).sort()).toEqual(["kick:kickpro", "twitch:small"]);

    const twitchDown = new LiveService({
      source,
      directories: [directory("twitch", { liveDotaStreams: async () => null }), directory("kick")],
    });
    expect((await twitchDown.hub()).streams?.map((s) => s.channel)).toEqual(["kickpro"]);
  });

  it("has no streams when every site is down, or none is set up", async () => {
    const down = new LiveService({
      source,
      directories: [directory("twitch", { liveDotaStreams: async () => null })],
    });
    expect(await down.hub()).toEqual({ streams: null, hints: {} });
    const none = new LiveService({ source });
    expect(none.platforms).toEqual([]);
    expect(await none.hub()).toEqual({ streams: null, hints: {} });
  });

  it("keeps streams when the game feed fails", async () => {
    const broken: LiveSource = { games: async () => null, leagueName: async () => null };
    const hub = await new LiveService({ source: broken, directories: [directory("twitch")] }).hub();
    expect(hub.streams).toHaveLength(2);
    expect(hub.hints).toEqual({});
  });

  it("searches every site with live channels first, failing only when none answers", async () => {
    const service = new LiveService({
      source,
      directories: [directory("twitch"), directory("kick")],
    });
    expect((await service.searchChannels("o", false)).map((h) => h.login)).toEqual([
      "on",
      "kickon",
      "off",
      "kickoff",
    ]);
    const partial = new LiveService({
      source,
      directories: [directory("twitch", { searchChannels: async () => null }), directory("kick")],
    });
    expect((await partial.searchChannels("o", false)).map((h) => h.login)).toEqual([
      "kickon",
      "kickoff",
    ]);
    const down = new LiveService({
      source,
      directories: [directory("twitch", { searchChannels: async () => null })],
    });
    await expect(down.searchChannels("x", false)).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
    await expect(new LiveService({ source }).searchChannels("x", true)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
