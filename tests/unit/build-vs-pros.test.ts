import { describe, expect, it } from "vitest";
import { buildVsPros } from "@/modules/heroes/domain/build-vs-pros";

describe("buildVsPros", () => {
  it("puts your share next to each pro item and flags top items you rarely buy", () => {
    const keys: Record<number, string> = { 145: "bfury", 147: "manta", 116: "black_king_bar" };
    const rows = buildVsPros(
      [
        { phase: "mid", itemId: 145, rank: 1 },
        { phase: "mid", itemId: 147, rank: 2 },
        { phase: "late", itemId: 116, rank: 1 },
        { phase: "late", itemId: 145, rank: 2 }, // already listed in mid
        { phase: "late", itemId: 999, rank: 3 }, // unknown item
      ],
      (id) => keys[id],
      { bfury: 0.8, black_king_bar: 0.2 },
    );
    expect(rows.map((r) => [r.key, r.yourShare, r.rarely])).toEqual([
      ["bfury", 0.8, false],
      ["manta", 0, true],
      ["black_king_bar", 0.2, true],
    ]);
  });
});
