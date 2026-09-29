import { describe, expect, it } from "vitest";
import { assignPatch } from "@/modules/matches/domain/patch-assignment";

const timeline = [
  { name: "7.41", releasedAt: new Date("2026-03-24T00:00:00Z") },
  { name: "7.40", releasedAt: new Date("2025-12-16T00:00:00Z") },
];

describe("assignPatch", () => {
  it("assigns the patch in effect at match start, regardless of timeline order", () => {
    expect(assignPatch(new Date("2026-01-10T12:00:00Z"), timeline)).toEqual({
      patch: "7.40",
      certainty: "confident",
    });
    expect(assignPatch(new Date("2026-06-01T00:00:00Z"), timeline)).toEqual({
      patch: "7.41",
      certainty: "confident",
    });
  });

  it("flags matches within a day after a release as boundary", () => {
    expect(assignPatch(new Date("2026-03-24T05:00:00Z"), timeline)).toEqual({
      patch: "7.41",
      certainty: "boundary",
    });
  });

  it("flags matches within a day before the next release as boundary", () => {
    expect(assignPatch(new Date("2026-03-23T20:00:00Z"), timeline)).toEqual({
      patch: "7.40",
      certainty: "boundary",
    });
  });

  it("returns unknown before the timeline starts or when it is empty", () => {
    expect(assignPatch(new Date("2020-01-01T00:00:00Z"), timeline)).toEqual({
      patch: null,
      certainty: "unknown",
    });
    expect(assignPatch(new Date(), [])).toEqual({ patch: null, certainty: "unknown" });
  });
});
