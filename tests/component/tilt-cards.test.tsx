import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AfterLossesPanel, TiltWarningCard } from "@/modules/sessions/ui/tilt-cards";

describe("tilt cards", () => {
  it("suggests a break with the player's own numbers", () => {
    render(
      <TiltWarningCard
        warning={{
          streak: 3,
          after: { games: 58, wins: 24, rate: 24 / 58 },
          baseline: { games: 600, wins: 312, rate: 0.52 },
        }}
      />,
    );
    const card = screen.getByRole("region", { name: "Tilt check" });
    expect(card).toHaveTextContent("3 losses in a row. Maybe take a short break?");
    expect(card).toHaveTextContent(
      "After 3 straight losses in a session you've won 41.4% of 58 ranked games, against 52.0% overall.",
    );
  });

  it("hides rates from too few games", () => {
    render(
      <AfterLossesPanel
        stats={{
          baseline: { games: 300, wins: 156, rate: 0.52 },
          afterLosses: {
            2: { games: 40, wins: 18, rate: 0.45 },
            3: { games: 9, wins: 3, rate: 1 / 3 },
          },
        }}
      />,
    );
    const panel = screen.getByRole("region", { name: "After losses" });
    expect(panel).toHaveTextContent("45.0%");
    expect(panel).toHaveTextContent("9 games, too few to say");
    expect(panel).not.toHaveTextContent("33.3%");
  });
});
