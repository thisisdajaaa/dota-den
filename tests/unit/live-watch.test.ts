import { describe, expect, it } from "vitest";
import type { LiveGame } from "@/modules/live/domain/live-game";
import {
  guessStreamGames,
  matchStreams,
  searchLinks,
  type LiveStream,
} from "@/modules/live/domain/watch";

const game = (over: Partial<LiveGame> = {}): LiveGame => ({
  matchId: "1",
  leagueId: 1,
  leagueName: "BLAST Slam VIII",
  teams: { radiant: "Team Spirit", dire: "OG" },
  score: { radiant: 0, dire: 0 },
  radiantLead: 0,
  gameTimeSec: 0,
  delaySec: 900,
  averageMmr: null,
  spectators: 0,
  players: [{ accountId32: 1, name: "Yatoro", heroId: 1, side: "radiant", isPro: true }],
  updatedAt: new Date(0),
  ...over,
});
const stream = (channel: string, title: string, viewers = 100): LiveStream => ({
  platform: "twitch",
  channel,
  displayName: channel,
  title,
  viewers,
  language: "en",
});

describe("matchStreams", () => {
  it("finds streams naming the teams, league or pros, best match first", () => {
    const res = matchStreams(game(), [
      stream("blast", "LIVE: Spirit vs OG | BLAST Slam VIII Playoffs", 50_000),
      stream("random", "ranked grind to immortal", 90_000),
      stream("fan", "Watching Yatoro today", 300),
      stream("blog", "my dota blog stream", 10),
    ]);
    expect(res.map((s) => s.channel)).toEqual(["blast", "fan"]);
    expect(res[0].mentions).toEqual(["Team Spirit", "OG", "BLAST Slam VIII"]);
  });

  it("doesn't link a pub stream whose title only shares a word with a team", () => {
    // "Spirit" alone is also a hero's name; written in full, or with another name, it links.
    const res = matchStreams(game(), [
      stream("pub", "Storm Spirit mid 12k MMR grind", 9_000),
      stream("full", "Team Spirit bootcamp scrims", 100),
      stream("pair", "spirit vs og later today", 50),
    ]);
    expect(res.map((s) => s.channel).sort()).toEqual(["full", "pair"]);
  });

  it("finds nothing for a public game without pros", () => {
    const pub = game({
      leagueId: null,
      leagueName: null,
      teams: { radiant: null, dire: null },
      players: [],
    });
    expect(matchStreams(pub, [stream("a", "Spirit vs OG")])).toEqual([]);
    expect(searchLinks(pub)).toEqual([]);
  });
});

describe("searchLinks", () => {
  it("searches the matchup on Twitch and YouTube live, plus the league", () => {
    const links = searchLinks(game());
    expect(links.map((l) => l.site)).toEqual(["Twitch", "YouTube", "Twitch"]);
    expect(links[0].href).toBe("https://www.twitch.tv/search?term=Team%20Spirit%20vs%20OG");
    expect(links[1].href).toContain("sp=EgJAAQ%253D%253D");
  });
});

describe("guessStreamGames", () => {
  const other = game({
    matchId: "2",
    leagueName: "Other Cup",
    teams: { radiant: "Tundra", dire: "Liquid" },
    players: [],
    spectators: 10,
  });

  it("links each stream to the live game its title mentions most", () => {
    const hints = guessStreamGames(
      [
        stream("blast", "LIVE: Spirit vs OG | BLAST Slam VIII"),
        stream("tundra", "Tundra vs Liquid, Other Cup day 2"),
        stream("random", "ranked grind to immortal"),
        stream("fan", "watching Yatoro"),
      ],
      [game({ spectators: 500 }), other],
    );
    expect(hints.get("twitch:blast")).toEqual({
      matchId: "1",
      radiant: "Team Spirit",
      dire: "OG",
      leagueName: "BLAST Slam VIII",
      mentions: ["Team Spirit", "OG", "BLAST Slam VIII"],
    });
    expect(hints.get("twitch:tundra")?.matchId).toBe("2");
    expect(hints.get("twitch:fan")?.mentions).toEqual(["Yatoro"]);
    expect(hints.has("twitch:random")).toBe(false);
  });

  it("breaks ties by spectators", () => {
    const a = game({ matchId: "a", leagueName: "Shared League", spectators: 5 });
    const b = game({
      matchId: "b",
      leagueName: "Shared League",
      teams: { radiant: null, dire: null },
      players: [],
      spectators: 50,
    });
    const hints = guessStreamGames([stream("s", "Shared League finals")], [a, b]);
    expect(hints.get("twitch:s")?.matchId).toBe("b");
  });

  it("ignores games with nothing to match", () => {
    const pub = game({ leagueName: null, teams: { radiant: null, dire: null }, players: [] });
    expect(guessStreamGames([stream("a", "anything")], [pub]).size).toBe(0);
  });
});
