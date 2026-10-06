import { describe, expect, it } from "vitest";
import {
  compositionFeedback,
  type CompositionFinding,
  type FeedbackCategory,
  type FeedbackHero,
} from "@/modules/drafts/domain/composition-feedback";

const hero = (
  id: number,
  name: string,
  roles: string[],
  attackType: FeedbackHero["attackType"],
  primaryAttr: FeedbackHero["primaryAttr"] = "str",
): FeedbackHero => ({ id, name, roles, attackType, primaryAttr });

// Role tags as reported by OpenDota /heroes.
const LION = hero(26, "Lion", ["Support", "Disabler", "Nuker", "Initiator"], "Ranged", "int");
const TIDE = hero(29, "Tidehunter", ["Initiator", "Durable", "Disabler", "Nuker"], "Melee");
const JUGG = hero(8, "Juggernaut", ["Carry", "Pusher", "Escape"], "Melee", "agi");
const SHAMAN = hero(27, "Shadow Shaman", ["Support", "Pusher", "Disabler", "Nuker"], "Ranged");
const AXE = hero(2, "Axe", ["Initiator", "Durable", "Disabler", "Carry"], "Melee");
const PA = hero(44, "Phantom Assassin", ["Carry", "Escape"], "Melee", "agi");
const AM = hero(1, "Anti-Mage", ["Carry", "Escape", "Nuker"], "Melee", "agi");
const SLARK = hero(93, "Slark", ["Carry", "Escape", "Disabler", "Nuker"], "Melee", "agi");
const TROLL = hero(95, "Troll Warlord", ["Carry", "Pusher", "Disabler", "Durable"], "Melee");

const byCategory = (findings: CompositionFinding[], c: FeedbackCategory): CompositionFinding => {
  const f = findings.find((x) => x.category === c);
  if (!f) throw new Error(`missing ${c}`);
  return f;
};

describe("compositionFeedback", () => {
  const balanced = compositionFeedback([LION, TIDE, JUGG, SHAMAN, AXE]);

  it("covers every category once for a full team with medium confidence", () => {
    expect(balanced.map((f) => f.category).sort()).toEqual(
      [
        "carry_core",
        "control",
        "damage_profile",
        "durability",
        "initiation",
        "push",
        "range",
        "support",
      ].sort(),
    );
    expect(balanced.every((f) => f.confidence === "medium")).toBe(true);
  });

  it("names the contributing heroes in reasons", () => {
    const control = byCategory(balanced, "control");
    expect(control.level).toBe("strong");
    for (const name of ["Lion", "Tidehunter", "Shadow Shaman", "Axe"]) {
      expect(control.reason).toContain(name);
    }
    expect(control.reason).not.toContain("Juggernaut");
    expect(byCategory(balanced, "initiation").reason).toMatch(/Lion.*Tidehunter.*Axe/);
    expect(byCategory(balanced, "damage_profile").level).toBe("strong");
    expect(byCategory(balanced, "range").level).toBe("strong");
  });

  it("flags a greedy all-melee carry lineup", () => {
    const greedy = compositionFeedback([PA, AM, SLARK, TROLL, JUGG]);
    expect(byCategory(greedy, "support")).toMatchObject({ level: "weak" });
    expect(byCategory(greedy, "support").reason).toContain("No Support picked");
    expect(byCategory(greedy, "range").level).toBe("weak");
    expect(byCategory(greedy, "carry_core").level).toBe("ok");
    expect(byCategory(greedy, "carry_core").reason).toContain("Phantom Assassin");
    expect(byCategory(greedy, "initiation").level).toBe("weak");
  });

  it("uses low confidence and says so for incomplete lineups", () => {
    const partial = compositionFeedback([LION, JUGG]);
    expect(partial.every((f) => f.confidence === "low")).toBe(true);
    expect(partial.every((f) => f.reason.includes("based on 2 of 5 picks"))).toBe(true);
  });

  it("returns nothing for an empty team", () => {
    expect(compositionFeedback([])).toEqual([]);
  });

  it("never outputs a win probability or numeric score", () => {
    for (const team of [[LION, TIDE, JUGG, SHAMAN, AXE], [PA, AM, SLARK, TROLL, JUGG], [LION]]) {
      for (const f of compositionFeedback(team)) {
        expect(f.reason).not.toMatch(/%|win|probab|chance/i);
        expect(Object.keys(f).sort()).toEqual([
          "category",
          "confidence",
          "level",
          "phrase",
          "reason",
        ]);
        expect(JSON.stringify(f.phrase)).not.toMatch(/%|probab|chance/i);
        expect(["low", "medium"]).toContain(f.confidence);
      }
    }
  });
});
