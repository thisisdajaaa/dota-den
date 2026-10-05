import { describe, expect, it } from "vitest";
import { draftRecord } from "@/modules/drafts/domain/draft-record";

describe("draftRecord", () => {
  it("buckets your side's draft estimate and checks how often the favoured side won", () => {
    const r = draftRecord([
      { yourSide: "radiant", won: true, radiantPct: 60 }, // favoured, won
      { yourSide: "dire", won: false, radiantPct: 58 }, // against (42%), lost
      { yourSide: "dire", won: true, radiantPct: 40 }, // favoured (60%), won
      { yourSide: "radiant", won: true, radiantPct: 45 }, // against, won (upset)
      { yourSide: "radiant", won: false, radiantPct: 50 }, // even
    ]);
    expect(r.graded).toBe(5);
    expect(r.favoured).toEqual({ games: 2, wins: 2 });
    expect(r.against).toEqual({ games: 2, wins: 1 });
    expect(r.even).toEqual({ games: 1, wins: 0 });
    // Favoured side won in 3 of the 4 non-even games (the upset is the miss).
    expect(r.favouredSideWon).toEqual({ games: 4, wins: 3 });
  });
});
