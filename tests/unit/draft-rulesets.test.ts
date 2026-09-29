import { describe, expect, it } from "vitest";
import {
  getRuleset,
  latestRuleset,
  listRulesets,
  turnDurationMs,
  type DraftRuleset,
} from "@/modules/drafts/domain/rulesets";

const compact = (r: DraftRuleset): string =>
  r.sequence
    .map((s) => `${s.team === "first" ? "F" : "S"}${s.action === "ban" ? "b" : "p"}`)
    .join(" ");

function cm(): DraftRuleset {
  const r = getRuleset("cm-2026", 1);
  if (!r.ok) throw new Error("cm-2026 v1 missing");
  return r.value;
}

describe("rulesets", () => {
  it("encodes the patch 7.40 Captain's Mode order exactly", () => {
    expect(compact(cm())).toBe(
      [
        "Fb Fb Sb Sb Fb Sb Sb", // ban phase 1
        "Fp Sp", // pick phase 1
        "Fb Fb Sb", // ban phase 2
        "Sp Fp Fp Sp Sp Fp", // pick phase 2
        "Fb Sb Fb Sb", // ban phase 3
        "Fp Sp", // pick phase 3
      ].join(" "),
    );
  });

  it("gives each CM team 7 bans and 5 picks", () => {
    for (const team of ["first", "second"] as const) {
      const steps = cm().sequence.filter((s) => s.team === team);
      expect(steps.filter((s) => s.action === "ban")).toHaveLength(7);
      expect(steps.filter((s) => s.action === "pick")).toHaveLength(5);
    }
  });

  it("uses 15s first-phase bans, 30s otherwise and 130s reserve", () => {
    const r = cm();
    expect(turnDurationMs(r, 0)).toBe(15_000);
    expect(turnDurationMs(r, 6)).toBe(15_000);
    expect(turnDurationMs(r, 7)).toBe(30_000);
    expect(turnDurationMs(r, 9)).toBe(30_000);
    expect(r.timing.reservePerTeamSec).toBe(130);
  });

  it("records a source and verification date for CM", () => {
    expect(cm().source).toContain("dota2.com/patches/7.40");
    expect(cm().verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("marks the practice ruleset as custom and unverified", () => {
    const r = getRuleset("practice-simple", 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.verifiedAt).toBeNull();
    expect(compact(r.value)).toBe("Fb Sb Fb Sb Fb Sb Fb Sb Fp Sp Fp Sp Fp Sp Fp Sp Fp Sp");
  });

  it("returns a typed error for unknown ids or versions", () => {
    expect(getRuleset("cm-2026", 99)).toEqual({
      ok: false,
      error: { type: "unknown_ruleset", id: "cm-2026", version: 99 },
    });
    expect(getRuleset("nope", 1).ok).toBe(false);
  });

  it("lists rulesets with unique id/version pairs and finds the latest", () => {
    const keys = listRulesets().map((r) => `${r.id}@${r.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(latestRuleset("cm-2026")?.version).toBe(1);
    expect(latestRuleset("nope")).toBeNull();
  });
});
