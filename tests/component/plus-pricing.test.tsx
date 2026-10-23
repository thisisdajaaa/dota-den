import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlanDto } from "@/modules/plus/dtos/responses/plus.dto";
import { PlanCard } from "@/modules/plus/ui/plan-card";
import { PlusPricing } from "@/modules/plus/ui/plus-pricing";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const limits = { players: 200, streamers: 200, groups: 10 };
const freePlan: PlanDto = {
  plus: false,
  reason: "none",
  until: null,
  status: null,
  plan: null,
  renewsAt: null,
  endsAt: null,
  canManage: false,
  stillBills: false,
};

describe("PlusPricing", () => {
  it("says 'coming soon' and offers no checkout when Plus isn't configured", () => {
    render(
      <PlusPricing offer={{ status: "off", plans: [] }} signedIn plan={null} limits={limits} />,
    );
    expect(screen.getByRole("heading", { name: "Plus is coming soon" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /get plus/i })).not.toBeInTheDocument();
    expect(screen.queryByText("₱299")).not.toBeInTheDocument();
    // Honest copy is there either way.
    expect(screen.getByRole("heading", { name: "Free for everyone, always" })).toBeInTheDocument();
  });

  it("lists the AI coach (unlimited vs one a week free) and priority sync, honestly", () => {
    render(
      <PlusPricing offer={{ status: "off", plans: [] }} signedIn plan={null} limits={limits} />,
    );
    expect(screen.getByText("Unlimited AI coach")).toBeVisible();
    expect(screen.getByText(/free: one new review a week/)).toBeVisible();
    expect(screen.getByText(/it can be wrong/)).toBeVisible();
    expect(screen.getByText("Priority sync")).toBeVisible();
    expect(screen.getByText(/same OpenDota budget as everyone/)).toBeVisible();
    // The weekly free review is listed under what's free.
    const free = screen.getByRole("heading", { name: "Free for everyone, always" }).parentElement!;
    expect(
      within(free).getByText(/one new review of your own parsed match per week/),
    ).toBeVisible();
    // The existing perks stay.
    expect(screen.getByText("Go-live alerts")).toBeVisible();
    expect(screen.getByText("Supporter badge")).toBeVisible();
    expect(screen.getByText("Room for more")).toBeVisible();
  });

  it("says new subscriptions are paused under the kill switch", () => {
    render(
      <PlusPricing offer={{ status: "paused", plans: [] }} signedIn plan={null} limits={limits} />,
    );
    expect(screen.getByRole("heading", { name: "New subscriptions are paused" })).toBeVisible();
    expect(screen.queryByRole("link", { name: /get plus/i })).not.toBeInTheDocument();
  });

  it("shows both plans with checkout links through our server route", () => {
    render(
      <PlusPricing
        offer={{ status: "available", plans: ["monthly", "yearly"] }}
        signedIn
        plan={freePlan}
        limits={limits}
      />,
    );
    const monthly = screen.getByRole("article", { name: "Monthly" });
    expect(within(monthly).getByText("₱299")).toBeVisible();
    expect(within(monthly).getByRole("link", { name: /get plus monthly/i })).toHaveAttribute(
      "href",
      "/api/v1/plus/checkout?plan=monthly",
    );
    const yearly = screen.getByRole("article", { name: "Yearly" });
    expect(within(yearly).getByText("₱2,990")).toBeVisible();
    expect(screen.getByText(/local currency/i)).toBeVisible();
    expect(screen.getByText(/Cancel anytime/i)).toBeVisible();
    expect(screen.getByText(/Track up to 200 players, follow 200 channels/)).toBeVisible();
    expect(screen.getByRole("link", { name: "terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "refund policy" })).toHaveAttribute("href", "/refunds");
  });

  it("asks guests to sign in first and tells subscribers they have it", () => {
    const { unmount } = render(
      <PlusPricing
        offer={{ status: "available", plans: ["monthly"] }}
        signedIn={false}
        plan={null}
        limits={limits}
      />,
    );
    expect(screen.getByRole("link", { name: /sign in with steam/i })).toHaveAttribute(
      "href",
      "/api/v1/auth/steam/login?next=%2Fplus",
    );
    unmount();
    render(
      <PlusPricing
        offer={{ status: "available", plans: ["monthly"] }}
        signedIn
        plan={{ ...freePlan, plus: true, reason: "active", status: "active" }}
        limits={limits}
      />,
    );
    expect(screen.getByText(/You have Plus/)).toBeVisible();
    expect(screen.queryByRole("link", { name: /get plus/i })).not.toBeInTheDocument();
  });
});

describe("PlanCard", () => {
  const offer = { status: "available" as const, plans: ["monthly" as const] };

  it("shows the free plan with a link to Plus", () => {
    render(<PlanCard plan={freePlan} offer={offer} />);
    expect(screen.getByRole("heading", { name: "Your plan" })).toBeVisible();
    expect(screen.getByText("Free")).toBeVisible();
    expect(screen.getByRole("link", { name: /see what plus adds/i })).toHaveAttribute(
      "href",
      "/plus",
    );
    expect(screen.queryByRole("link", { name: /manage/i })).not.toBeInTheDocument();
  });

  it("shows an active plan with its renewal date, badge and the manage link", () => {
    render(
      <PlanCard
        plan={{
          ...freePlan,
          plus: true,
          reason: "active",
          status: "active",
          plan: "yearly",
          renewsAt: "2027-10-23T12:00:00.000Z",
          canManage: true,
          stillBills: true,
        }}
        offer={offer}
      />,
    );
    expect(screen.getByText("Dota Den Plus")).toBeVisible();
    expect(screen.getByRole("img", { name: "Dota Den Plus supporter" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Renews on Oct 23, 2027");
    expect(screen.getByRole("link", { name: /manage or cancel/i })).toHaveAttribute(
      "href",
      "/api/v1/me/plus/portal",
    );
  });

  it("explains cancelled (until the period end) and grace states", () => {
    const { unmount } = render(
      <PlanCard
        plan={{
          ...freePlan,
          plus: true,
          reason: "cancelled_until_period_end",
          status: "cancelled",
          until: "2026-11-23T12:00:00.000Z",
          canManage: true,
        }}
        offer={offer}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelled. You keep Plus until Nov 23, 2026.",
    );
    unmount();
    render(
      <PlanCard
        plan={{
          ...freePlan,
          plus: true,
          reason: "grace",
          status: "past_due",
          until: "2026-10-30T00:00:00.000Z",
        }}
        offer={offer}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Update your card by Oct 30, 2026/);
  });
});
