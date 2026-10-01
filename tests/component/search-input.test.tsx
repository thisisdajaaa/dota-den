import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SearchInput } from "@/components/search-input";

function Controlled() {
  const [q, setQ] = useState("");
  return <SearchInput aria-label="Find" value={q} onValueChange={setQ} />;
}

describe("SearchInput", () => {
  it("shows a clear button once there's text, and clearing refocuses the box", () => {
    render(<Controlled />);
    const box = screen.getByRole("searchbox", { name: "Find" });
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    fireEvent.change(box, { target: { value: "pudge" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears with Escape", () => {
    render(<Controlled />);
    const box = screen.getByRole("searchbox", { name: "Find" });
    fireEvent.change(box, { target: { value: "lina" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveValue("");
  });

  it("works uncontrolled inside a form", () => {
    render(
      <form>
        <SearchInput aria-label="Find" name="q" defaultValue="dendi" />
      </form>,
    );
    const box = screen.getByRole("searchbox", { name: "Find" });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
  });
});
