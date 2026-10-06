import { describe, expect, it } from "vitest";
import {
  decodeSnapshot,
  encodeSnapshot,
  replaySnapshot,
  snapshotOf,
  type DraftSnapshot,
} from "@/modules/drafts/domain/snapshot";
import { isComplete } from "@/modules/drafts/domain/draft-state";
import { getRuleset } from "@/modules/drafts/domain/rulesets";

const POOL = Array.from({ length: 130 }, (_, i) => i + 1);

function fullSnapshot(rulesetId: string): DraftSnapshot {
  const ruleset = getRuleset(rulesetId, 1);
  if (!ruleset.ok) throw new Error("ruleset");
  return {
    v: 1,
    r: rulesetId,
    rv: 1,
    f: "radiant",
    t: ruleset.value.sequence.map((_, i) => i + 1),
  };
}

describe("draft snapshots", () => {
  it("round-trips through the URL-safe encoding", () => {
    const snap = fullSnapshot("cm-2026");
    const encoded = encodeSnapshot(snap);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSnapshot(encoded)).toEqual({ ok: true, value: snap });
  });

  it("replays a complete Captain's Mode draft through the engine", () => {
    const res = replaySnapshot(fullSnapshot("cm-2026"), POOL);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(isComplete(res.value)).toBe(true);
    expect(res.value.sides.radiant.picks).toHaveLength(5);
    expect(res.value.sides.dire.bans).toHaveLength(7);
    // Re-snapshotting the replayed state gives the same snapshot.
    expect(snapshotOf(res.value)).toEqual(fullSnapshot("cm-2026"));
  });

  it("replays a skipped ban as a timed-out ban", () => {
    const snap: DraftSnapshot = { v: 1, r: "cm-2026", rv: 1, f: "dire", t: [null, 5, 6] };
    const res = replaySnapshot(snap, POOL);
    expect(res.ok && res.value.turns[0]).toMatchObject({
      heroId: null,
      resolution: "timeout",
      side: "dire",
    });
    expect(res.ok && res.value.turns).toHaveLength(3);
  });

  it.each([
    ["duplicate hero", { t: [5, 5] }],
    ["hero outside the pool", { t: [999] }],
    ["unknown ruleset", { r: "nope" }],
    ["too many steps", { t: Array.from({ length: 30 }, (_, i) => i + 1) }],
  ])("rejects a tampered snapshot: %s", (_name, patch) => {
    const snap = {
      ...fullSnapshot("practice-simple"),
      t: [] as Array<number | null>,
      ...patch,
    } as DraftSnapshot;
    expect(replaySnapshot(snap, POOL).ok).toBe(false);
  });

  it.each(["", "!!!", "e30", "a".repeat(3000)])("rejects malformed encodings %#", (s) => {
    expect(decodeSnapshot(s).ok).toBe(false);
  });
});
