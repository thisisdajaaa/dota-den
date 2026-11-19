import { describe, expect, it } from "vitest";
import {
  factsFromResult,
  factsFromText,
  unbackedNames,
  ungroundedReply,
} from "@/modules/assistant/domain/ask-grounding";

const result = {
  hero: "Pudge",
  games: 23,
  wins: 9,
  winRatePct: 39.1,
  averages: { deaths: 8.4 },
  replays: {
    itemTimings: [{ item: "Blink Dagger", medianInWins: "14:20", medianInLosses: "19:05" }],
  },
  patch: "7.39d",
  smallSample: false,
  missing: null,
};

describe("Ask Den grounding", () => {
  const facts = factsFromResult(result, "t0");

  it("turns every value of a tool result into a fact (clocks as clocks)", () => {
    expect(facts).toContainEqual({ key: "t0.games", label: "t0.games", value: 23, unit: "number" });
    expect(facts).toContainEqual(
      expect.objectContaining({
        key: "t0.replays.itemTimings.0.medianInWins",
        value: 860,
        unit: "clock",
      }),
    );
    expect(facts.find((f) => f.key === "t0.smallSample")).toBeUndefined();
  });

  it("passes a reply that only quotes the tools' numbers (rounded too)", () => {
    expect(
      ungroundedReply(
        "Sa 23 games mo sa Pudge, 9 lang ang panalo (39%). Namamatay ka ng 8.4 kada laro. Sa mga panalo, Blink sa 14:20; sa talo, 19:05. Patch 7.39d.",
        facts,
      ),
    ).toEqual([]);
  });

  it("allows minute markers in English, Filipino and Cebuano without a fact", () => {
    expect(
      ungroundedReply(
        "Ward by minute 10. Sa unang 10 minuto, mag-stack. Sa 15 ka minuto, smoke.",
        facts,
      ),
    ).toEqual([]);
  });

  it("catches invented numbers and clocks", () => {
    expect(ungroundedReply("You won 12 of 23 games (52%).", facts)).toEqual(["12", "52"]);
    expect(ungroundedReply("Get Blink at 12:00.", facts)).toEqual(["12:00"]);
    expect(ungroundedReply("Your MMR is 3500.", facts)).toEqual(["3500"]);
  });

  it("lets the player's own numbers be repeated", () => {
    const withQuestion = [...facts, ...factsFromText("I'm 2500 MMR, why do I lose?", "question")];
    expect(ungroundedReply("At 2500 MMR, focus on lane.", withQuestion)).toEqual([]);
  });
});

describe("Ask Den name check", () => {
  const catalog = [
    "Blink Dagger",
    "Black King Bar",
    "Boots of Speed",
    "Observer Ward",
    "Tiny",
    "Lion",
    "Pudge",
    "Aghanim's Scepter",
  ];

  it("allows names a tool returned or the player wrote, and everyday items", () => {
    expect(
      unbackedNames(
        "On Lion, get Blink Dagger first and carry an Observer Ward. A tiny bit of patience helps.",
        catalog,
        ["What should I build on Lion?", JSON.stringify({ items: [{ item: "Blink Dagger" }] })],
      ),
    ).toEqual([]);
  });

  it("catches heroes and items named from the model's own memory", () => {
    expect(
      unbackedNames("Buy Black King Bar and Aghanim’s Scepter, and watch out for Pudge.", catalog, [
        "What should I build on Lion?",
        JSON.stringify({ items: [{ item: "Blink Dagger" }] }),
      ]),
    ).toEqual(["Aghanim's Scepter", "Black King Bar", "Pudge"]);
  });
});
