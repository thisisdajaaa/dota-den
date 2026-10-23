import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatTile } from "@/components/stat-tile";

describe("StatTile", () => {
  it("spans three rows of its grid so labels, values and details line up across a row", () => {
    const { container } = render(<StatTile label="On public boards" value="0" />);
    const tile = container.querySelector('[data-slot="stat-tile"]');
    expect(tile).toHaveClass("row-span-3", "grid-rows-subgrid");
    // Always three children, one per row, even without a meter or detail.
    expect(tile?.children).toHaveLength(3);
    expect(screen.getByText("On public boards")).toBeInTheDocument();
    expect(screen.getByText("0")).toHaveClass("text-3xl");
  });

  it("shows the meter and detail in the footer row", () => {
    const { container } = render(
      <StatTile
        label="Win rate"
        value="58.3%"
        meter={0.583}
        tone="win"
        detail="7 wins · 5 losses"
      />,
    );
    const footer = container.querySelector('[data-slot="stat-tile"]')?.lastElementChild;
    expect(footer).toHaveTextContent("7 wins · 5 losses");
    expect(footer?.querySelector(".bg-win")).toHaveStyle({ width: "58.3%" });
  });

  it("sets a sentence-long value smaller than a number", () => {
    render(<StatTile label="Compared with your usual" value="Too few games together to judge" />);
    expect(screen.getByText("Too few games together to judge")).toHaveClass("text-xl");
  });
});
