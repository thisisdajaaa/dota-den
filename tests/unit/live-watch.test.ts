import { describe, expect, it } from "vitest";
import type { LiveGame } from "@/modules/live/domain/live-game";
import { matchStreams, searchLinks, type LiveStream } from "@/modules/live/domain/watch";

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
