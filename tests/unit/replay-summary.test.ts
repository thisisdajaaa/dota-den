import { describe, expect, it } from "vitest";
import {
  aggregateReplays,
  laneOutcome,
  replaySummary,
  type ReplayPlayer,
} from "@/modules/report/domain/replay-summary";

const p = (
  playerSlot: number,
  lane: number | null,
  goldAt10: number,
  extra = {},
): ReplayPlayer => ({
  playerSlot,
  lane,
  roaming: false,
  goldAt10,
  roshanKills: 0,
  campsStacked: 0,
  dewards: 0,
  runes: {},
  ...extra,
});

// Lanes and gold at 10 from a public parsed pro match (9030943450).
const match = [
  p(0, 2, 3652, {
    roshanKills: 1,
    campsStacked: 2,
    dewards: 1,
    runes: { 0: 1, 1: 1, 5: 3, 7: 2, 8: 1 },
  }),
  p(1, 1, 1642),
  p(2, 3, 4288),
  p(3, 3, 1752),
  p(4, 1, 4057),
  p(128, 3, 3553),
  p(129, 3, 1961, { roaming: true }),
  p(130, 1, 3295),
  p(131, 1, 1852),
  p(132, 2, 3954),
];

describe("replay summary", () => {
  it("compares your lane's gold at 10 with the enemies in the same lane", () => {
    expect(laneOutcome(match, match[4])).toBe("won"); // 5699 vs 5147
    expect(laneOutcome(match, match[0])).toBe("even"); // 3652 vs 3954
    expect(laneOutcome(match, match[9])).toBe("even");
    expect(laneOutcome(match, match[5])).toBe("lost"); // 3553 vs 6040; the roamer doesn't count
    expect(laneOutcome(match, match[6])).toBeNull(); // roaming
    expect(laneOutcome([p(0, 4, 3000), p(128, 4, 2000)], p(0, 4, 3000))).toBeNull(); // jungle
  });

  it("counts objectives and splits power from bounty runes", () => {
    expect(replaySummary(match, match[0])).toEqual({
      lane: "even",
      roshanKills: 1,
      campsStacked: 2,
      dewards: 1,
      powerRunes: 2,
      bountyRunes: 3,
    });
  });

  it("aggregates with the sample", () => {
    const agg = aggregateReplays([
      replaySummary(match, match[0]),
      replaySummary(match, match[4]),
      replaySummary(match, match[6]),
    ]);
    expect(agg.games).toBe(3);
    expect(agg.lanes).toEqual({ games: 2, won: 1, even: 1, lost: 0 });
    expect(agg.totals.bountyRunes).toBe(3);
  });
});
