import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CoachQuotaDto,
  CoachReviewDto,
  CoachViewDto,
} from "@/modules/matches/dtos/responses/coach.dto";
import { CoachCard } from "@/modules/matches/ui/coach-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const envelope = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ statusCode: status, ...body }), { status });

const FREE: CoachQuotaDto = { plan: "free", limit: 1, remaining: 1, resetsAt: null };
const USED: CoachQuotaDto = {
  plan: "free",
  limit: 1,
  remaining: 0,
  resetsAt: "2026-10-30T12:00:00.000Z",
};
const PLUS: CoachQuotaDto = { plan: "plus", limit: null, remaining: null, resetsAt: null };

const REVIEW: CoachReviewDto = {
  matchId: "7000000012",
  heroId: 1,
  model: "openai/gpt-oss-120b",
  locale: "en",
  createdAt: "2026-10-23T12:00:00.000Z",
  missing: ["party", "benchmarks"],
  points: [
    {
      kind: "strength",
      title: "Clean lane",
      detail: "You had 50 last hits at 10:00.",
      facts: [
        { key: "lastHitsAt10", base: "lastHitsAt10", subject: null, value: 50, unit: "count" },
      ],
    },
    {
      kind: "improve",
      title: "Faster Battle Fury",
      detail: "Battle Fury came at 18:20.",
      facts: [
        {
          key: "item.bfury",
          base: "itemTiming",
          subject: "Battle Fury",
          value: 1100,
          unit: "clock",
        },
        {
          key: "benchmark.gold_per_min",
          base: "benchmark",
          subject: "gold_per_min",
          value: 81,
          unit: "percent",
        },
        { key: "party", base: "party", subject: null, value: "unknown", unit: "text" },
      ],
    },
  ],
};

const renderCard = (initial: CoachViewDto) =>
  render(<CoachCard matchId="7000000012" initial={initial} />);

const card = () => screen.getByRole("region", { name: "Coaching points" });

describe("CoachCard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing when the coach is off", () => {
    const { container } = renderCard({ status: "off" });
    expect(container).toBeEmptyDOMElement();
  });

  it("explains that an unparsed match needs parsing, and offers the request", () => {
    renderCard({ status: "unparsed" });
    expect(card()).toHaveTextContent("needs parsing first");
    expect(within(card()).getByRole("button", { name: "Get detailed stats" })).toBeVisible();
    expect(within(card()).queryByRole("button", { name: "Write my review" })).toBeNull();
  });

  it("shows the free quota left, or unlimited with Plus, and labels it as AI", () => {
    renderCard({ status: "available", quota: FREE });
    expect(screen.getByTestId("coach-quota")).toHaveTextContent("1 free review left this week");
    expect(card()).toHaveTextContent("AI coach");
    expect(card()).toHaveTextContent("It can be wrong");
    expect(within(card()).getByRole("button", { name: "Write my review" })).toBeEnabled();
  });

  it("shows unlimited for Plus", () => {
    renderCard({ status: "available", quota: PLUS });
    expect(screen.getByTestId("coach-quota")).toHaveTextContent("Unlimited with Plus");
  });

  it("shows a loading state, then the points with our numbers next to them", async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    renderCard({ status: "available", quota: FREE });
    fireEvent.click(screen.getByRole("button", { name: "Write my review" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Reading your match…");
    expect(screen.queryByRole("button", { name: "Write my review" })).toBeNull();

    answer(
      envelope(200, {
        success: true,
        message: "Coach review written",
        data: { review: REVIEW, quota: USED, cached: false },
      }),
    );
    const lane = await screen.findByRole("listitem", { name: "Clean lane" });
    expect(lane).toHaveTextContent("Strength");
    expect(within(lane).getByRole("term")).toHaveTextContent("Last hits at 10:00");
    expect(within(lane).getByRole("definition")).toHaveTextContent("50");
    const bfury = screen.getByRole("listitem", { name: "Faster Battle Fury" });
    expect(bfury).toHaveTextContent("To work on");
    const values = within(bfury)
      .getAllByRole("definition")
      .map((d) => d.textContent);
    expect(values).toEqual(["18:20", "81%", "Unknown"]);
    expect(within(bfury).getAllByRole("term")[1]).toHaveTextContent("Gold per minute percentile");
    expect(card()).toHaveTextContent(
      "Not available for this match: party status (unknown), percentiles.",
    );
    expect(card()).toHaveTextContent("Model: openai/gpt-oss-120b");
    expect(screen.getByTestId("coach-quota")).toHaveTextContent(
      "You've used this week's free review.",
    );
  });

  it("says the coach is resting when the AI budget is spent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        envelope(503, {
          success: false,
          message: "The coach is resting. Try again later.",
          data: null,
          code: "upstream_unavailable",
          details: { reason: "resting" },
        }),
      ),
    );
    renderCard({ status: "available", quota: FREE });
    fireEvent.click(screen.getByRole("button", { name: "Write my review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The coach is resting");
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was counted");
    // The button comes back to try later.
    expect(screen.getByRole("button", { name: "Write my review" })).toBeEnabled();
  });

  it("shows a graceful error when the review couldn't be written", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        envelope(503, {
          success: false,
          message: "The coach couldn't write this review.",
          data: null,
          code: "upstream_unavailable",
          details: { reason: "failed" },
        }),
      ),
    );
    renderCard({ status: "available", quota: FREE });
    fireEvent.click(screen.getByRole("button", { name: "Write my review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't write a review");
  });

  it("switches to the upsell when the free review was used meanwhile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        envelope(429, {
          success: false,
          message: "You've used this week's free coach review.",
          data: null,
          code: "rate_limited",
          details: { reason: "quota", quota: USED },
        }),
      ),
    );
    renderCard({ status: "available", quota: FREE });
    fireEvent.click(screen.getByRole("button", { name: "Write my review" }));
    await waitFor(() =>
      expect(within(card()).getByRole("link", { name: /See Dota Den Plus/ })).toBeVisible(),
    );
    expect(screen.queryByRole("button", { name: "Write my review" })).toBeNull();
  });

  it("locked: says when the next free review comes and links to Plus", () => {
    renderCard({ status: "locked", quota: USED });
    expect(card()).toHaveTextContent("Next free review:");
    expect(within(card()).getByRole("link", { name: /See Dota Den Plus/ })).toHaveAttribute(
      "href",
      "/plus",
    );
    expect(card()).toHaveTextContent("unlimited coach reviews");
    expect(screen.queryByRole("button", { name: "Write my review" })).toBeNull();
  });

  it("a stored review shows straight away, with no button", () => {
    renderCard({ status: "ready", review: REVIEW, quota: USED });
    expect(screen.getAllByRole("listitem", { name: /./ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Write my review" })).toBeNull();
  });
});
