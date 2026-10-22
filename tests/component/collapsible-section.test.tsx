import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollapsibleSection } from "@/components/collapsible-section";

function renderSection() {
  return render(
    <CollapsibleSection storageKey="test" title="Goals and practice">
      <p>Inside</p>
    </CollapsibleSection>,
  );
}

describe("CollapsibleSection", () => {
  afterEach(() => localStorage.clear());

  it("starts open, folds away and remembers the choice", () => {
    const { unmount } = renderSection();
    const toggle = screen.getByRole("button", { name: "Goals and practice" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Inside")).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Inside")).not.toBeVisible();
    expect(localStorage.getItem("dd:collapsed:test")).toBe("1");
    unmount();

    renderSection();
    expect(screen.getByRole("button", { name: "Goals and practice" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("opens again when shown, and forgets the folded state", () => {
    localStorage.setItem("dd:collapsed:test", "1");
    renderSection();
    const toggle = screen.getByRole("button", { name: "Goals and practice" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(localStorage.getItem("dd:collapsed:test")).toBeNull();
  });
});
