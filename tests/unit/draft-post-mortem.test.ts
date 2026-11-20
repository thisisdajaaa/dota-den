import { describe, expect, it } from "vitest";
import {
  draftPostMortem,
  type PostMortemInput,
  type PostMortemPlayer,
} from "@/modules/drafts/domain/draft-post-mortem";
import type { LaneMatchup, OutlookHero } from "@/modules/drafts/domain/draft-outlook";

const player = (
  side: "radiant" | "dire",
  heroId: number,
  lane: number | null,
  goldAt10: number | null,
  extra: Partial<PostMortemPlayer> = {},
): PostMortemPlayer => ({
  side,
  heroId,
  lane,
  roaming: false,
  goldAt10,
  kills: 1,
  deaths: 1,
  assists: 1,
  netWorth: 10_000,
  heroDamage: 5_000,
  ...extra,
});

const lane = (l: LaneMatchup["lane"], edge: number | null): LaneMatchup => ({
  lane: l,
  label: l,
  radiant: [],
  dire: [],
  edge,
  source: "pro_lanes",
  games: 20,
  wins: 12,
});

const hero = (
  heroId: number,
  name: string,
  side: "radiant" | "dire",
  best: { name: string; edge: number } | null = null,
): OutlookHero => ({
  heroId,
  name,
  side,
  role: "core",
  position: null,
  positionShare: null,
  games: null,
  winRate: null,
  proPicks: null,
  proBans: null,
  proWinRate: null,
  contest: null,
  bestMatchup: best,
  worstMatchup: null,
});

const base: PostMortemInput = {
  radiantWin: false,
  durationSec: 41 * 60 + 20,
  // Radiant ahead early (up to +4k at 12), Dire takes over from minute 20.
  goldAdvantage: [
    0, 200, 400, 600, 900, 1200, 1500, 2000, 2500, 3000, 3200, 3600, 4000, 3500, 3000, 2400, 1800,
    1200, 600, 100, -400, -1200, -2000, -2600, -3200, -4000, -5000, -6000, -7000, -8000, -9000,
  ],
  players: [
    // Bottom: Radiant safe lane vs Dire offlane. Radiant +1,300.
    player("radiant", 1, 1, 4_200),
    player("radiant", 5, 1, 1_800),
    player("dire", 2, 1, 3_200),
    player("dire", 6, 1, 1_500),
    // Mid: within 500, even.
    player("radiant", 3, 2, 4_000),
    player("dire", 4, 2, 3_800),
    // Top: Dire safe lane wins by 900.
    player("radiant", 7, 3, 3_000),
    player("dire", 8, 3, 3_900),
    // A roaming support and a jungler don't count in lanes.
    player("radiant", 9, 3, 900, { roaming: true }),
    player("dire", 10, 4, 2_000),
  ],
  lanes: [lane("radiant_safe", 4), lane("mid", -3), lane("radiant_off", 2)],
  heroes: [
    hero(1, "Axe", "radiant", { name: "Phantom Assassin", edge: 3.2 }),
    hero(3, "Lina", "radiant", { name: "Sniper", edge: 1 }),
    hero(2, "Phantom Assassin", "dire", { name: "Lina", edge: 2.4 }),
    hero(4, "Sniper", "dire"),
  ],
};

describe("draftPostMortem", () => {
  const pm = draftPostMortem(base);

  it("reads each lane by gold earned at 10 minutes against what the draft expected", () => {
    expect(pm.lanes).toEqual([
      {
        lane: "radiant_safe",
        radiant: [1, 5],
        dire: [2, 6],
        goldDiff: 1_300,
        winner: "radiant",
        expected: "radiant",
        verdict: "as_drafted",
      },
      {
        lane: "mid",
        radiant: [3],
        dire: [4],
        goldDiff: 200,
        winner: null,
        expected: "dire",
        verdict: "no_read",
      },
      {
        lane: "radiant_off",
        radiant: [7],
        dire: [8],
        goldDiff: -900,
        winner: "dire",
        expected: "radiant",
        verdict: "against_draft",
      },
    ]);
  });

  it("finds where the winner gained, the comeback and when they led for good", () => {
    expect(pm.winner).toBe("dire");
    expect(pm.durationMin).toBe(41);
    expect(pm.swings).toEqual([
      { phase: "laning", fromMinute: 0, toMinute: 10, radiantChange: 3_200 },
      { phase: "mid", fromMinute: 10, toMinute: 25, radiantChange: -7_200 },
      { phase: "late", fromMinute: 25, toMinute: 30, radiantChange: -5_000 },
    ]);
    expect(pm.decidedIn).toBe("mid");
    expect(pm.comeback).toEqual({ gold: 4_000, minute: 12 });
    expect(pm.leadForGoodFrom).toBe(20);
  });

  it("follows each side's strongest counter in the draft with both heroes' games", () => {
    expect(pm.counters.map((c) => [c.side, c.hero.heroId, c.vs.heroId, c.edge])).toEqual([
      ["radiant", 1, 2, 3.2],
      ["dire", 2, 3, 2.4],
    ]);
  });

  it("leaves out lanes and gold swings without a parsed replay", () => {
    const unparsed = draftPostMortem({
      ...base,
      goldAdvantage: null,
      players: base.players.map((p) => ({ ...p, lane: null, goldAt10: null })),
    });
    expect(unparsed.lanes).toBeNull();
    expect(unparsed.swings).toBeNull();
    expect(unparsed.decidedIn).toBeNull();
    expect(unparsed.comeback).toBeNull();
    expect(unparsed.counters).toHaveLength(2);
  });

  it("no comeback when the winner was never far behind", () => {
    const easy = draftPostMortem({ ...base, radiantWin: true, goldAdvantage: [0, 500, 1_000] });
    expect(easy.comeback).toBeNull();
    expect(easy.leadForGoodFrom).toBe(1);
    expect(easy.decidedIn).toBe("laning");
  });
});
