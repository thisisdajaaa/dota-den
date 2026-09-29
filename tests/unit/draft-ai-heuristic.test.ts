import { describe, expect, it } from "vitest";
import { heuristicChoice } from "@/modules/drafts/domain/ai-heuristic";
import type { FeedbackHero } from "@/modules/drafts/domain/composition-feedback";

const h = (
  id: number,
  roles: string[],
  attackType: "Melee" | "Ranged" = "Melee",
): FeedbackHero => ({
  id,
  name: `Hero ${id}`,
  roles,
  attackType,
  primaryAttr: "str",
});

describe("heuristicChoice", () => {
  it("picks a hero that fills the team's missing roles", () => {
    const own = [h(1, ["Carry"]), h(2, ["Carry", "Nuker"], "Ranged")];
    const available = [
      h(10, ["Carry"]),
      h(11, ["Support", "Disabler"], "Ranged"),
      h(12, ["Pusher"]),
    ];
    const choice = heuristicChoice({ action: "pick", available, ownPicks: own, enemyPicks: [] });
    expect(choice?.heroId).toBe(11);
    expect(choice?.reason).toContain("Hero 11");
  });

  it("bans the hero that would best complete the enemy lineup", () => {
    const enemy = [h(1, ["Carry"]), h(2, ["Carry"])];
    const available = [h(10, ["Carry"]), h(11, ["Support", "Disabler", "Initiator", "Durable"])];
    expect(
      heuristicChoice({ action: "ban", available, ownPicks: [], enemyPicks: enemy })?.heroId,
    ).toBe(11);
  });

  it("is deterministic on ties and handles an empty pool", () => {
    const available = [h(5, []), h(3, [])];
    expect(
      heuristicChoice({ action: "pick", available, ownPicks: [], enemyPicks: [] })?.heroId,
    ).toBe(3);
    expect(
      heuristicChoice({ action: "pick", available: [], ownPicks: [], enemyPicks: [] }),
    ).toBeNull();
  });
});
