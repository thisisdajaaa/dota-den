import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/layout/site-footer";

describe("SiteFooter", () => {
  it("shows the unofficial fan project disclaimer", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/unofficial fan project/i);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      /not affiliated with or endorsed by Valve/i,
    );
  });
});
