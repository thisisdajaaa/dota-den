import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/layout/site-footer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

describe("SiteFooter", () => {
  it("shows the unofficial fan project disclaimer", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/unofficial fan project/i);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      /not affiliated with or endorsed by Valve/i,
    );
  });

  it("links the legal pages, privacy policy included", () => {
    render(<SiteFooter />);
    const legal = screen.getByRole("navigation", { name: "Legal" });
    for (const [name, href] of [
      ["Terms", "/terms"],
      ["Refunds", "/refunds"],
      ["Privacy", "/privacy"],
    ])
      expect(within(legal).getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("offers the language switch", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("English");
  });
});
