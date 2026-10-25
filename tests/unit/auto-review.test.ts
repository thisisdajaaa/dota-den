import { describe, expect, it, vi } from "vitest";
import {
  AppError,
  ConflictError,
  RateLimitedError,
  UpstreamUnavailableError,
} from "@/common/errors/app-error";
import {
  AUTO_REVIEW_FIRST_DELAY_SEC,
  AUTO_REVIEW_RETRY_DELAYS_SEC,
} from "@/modules/matches/domain/auto-review";
import type { CoachResultDto } from "@/modules/matches/dtos/responses/coach.dto";
import { AutoReviewService } from "@/modules/matches/services/auto-review.service";

const USER = "a".repeat(24);
const NOW = new Date("2026-10-25T12:00:00Z");

const result = (cached = false) =>
  ({
    review: {
      matchId: "900",
      heroId: 74,
      model: "m",
      locale: "fil",
      createdAt: NOW.toISOString(),
      missing: [],
      points: [
        { kind: "strength", title: "Clean lane", detail: "x", facts: [] },
        { kind: "improve", title: "More wards", detail: "y", facts: [] },
        { kind: "improve", title: "Stack", detail: "z", facts: [] },
      ],
    },
    quota: { plan: "plus", limit: null, remaining: null, resetsAt: null },
    cached,
  }) as unknown as CoachResultDto;

function setup(over: Partial<ConstructorParameters<typeof AutoReviewService>[0]> = {}) {
  const claimed = new Set<string>();
  const enqueue = vi.fn(async (_a: unknown, _d: number) => {});
  const notify = vi.fn(async () => 1);
  const review = vi.fn(async () => result());
  const recentRanked = vi.fn(async () => ["903", "902", "901"].slice(0, 2));
  const svc = new AutoReviewService({
    reviews: {
      recentRanked,
      claim: async (userId, matchId) => {
        const k = `${userId}:${matchId}`;
        if (claimed.has(k)) return false;
        claimed.add(k);
        return true;
      },
      exportForOwner: async () => [],
      deleteForOwner: async () => 0,
    },
    isPlus: async () => true,
    wants: async () => true,
    user: async () => ({ accountId32: 7, locale: "fil" }),
    review,
    enqueue,
    notify,
    logger: { info: vi.fn(), warn: vi.fn() },
    now: () => NOW,
    ...over,
  });
  return { svc, enqueue, notify, review, recentRanked };
}

const attempt = (n = 0) => ({ userId: USER, matchId: "900", attempt: n });

describe("AutoReviewService.afterSync", () => {
  it("schedules the newest ranked games once each, after a short wait", async () => {
    const { svc, enqueue, recentRanked } = setup();
    expect(await svc.afterSync({ id: USER, accountId32: 7 })).toBe(2);
    expect(recentRanked).toHaveBeenCalledWith(7, new Date(NOW.getTime() - 24 * 3_600_000), 2);
    expect(enqueue.mock.calls).toEqual([
      [{ userId: USER, matchId: "903", attempt: 0 }, AUTO_REVIEW_FIRST_DELAY_SEC],
      [{ userId: USER, matchId: "902", attempt: 0 }, AUTO_REVIEW_FIRST_DELAY_SEC],
    ]);
    // The next sync sees the same games: nothing new is scheduled.
    expect(await svc.afterSync({ id: USER, accountId32: 7 })).toBe(0);
  });

  it("does nothing without Plus, or with the setting off", async () => {
    expect(
      await setup({ isPlus: async () => false }).svc.afterSync({ id: USER, accountId32: 7 }),
    ).toBe(0);
    const off = setup({ wants: async () => false });
    expect(await off.svc.afterSync({ id: USER, accountId32: 7 })).toBe(0);
    expect(off.recentRanked).not.toHaveBeenCalled();
  });
});

describe("AutoReviewService.run", () => {
  it("writes the review in the player's language and tells them once", async () => {
    const { svc, review, notify } = setup();
    expect(await svc.run(attempt())).toBe("written");
    expect(review).toHaveBeenCalledWith({ id: USER, accountId32: 7 }, "900", "fil");
    expect(notify).toHaveBeenCalledWith(USER, "900", {
      heroId: 74,
      first: "Clean lane",
      points: 3,
    });
  });

  it("stays quiet when the player already opened the review", async () => {
    const { svc, notify } = setup({ review: async () => result(true) });
    expect(await svc.run(attempt())).toBe("already_written");
    expect(notify).not.toHaveBeenCalled();
  });

  it("waits longer each time the replay isn't parsed yet, then gives up", async () => {
    const unparsed = async () => {
      throw new ConflictError("not parsed", { reason: "unparsed" });
    };
    const { svc, enqueue } = setup({ review: unparsed });
    expect(await svc.run(attempt(0))).toBe("retry_later");
    expect(enqueue).toHaveBeenLastCalledWith(attempt(1), AUTO_REVIEW_RETRY_DELAYS_SEC[0]);
    expect(await svc.run(attempt(2))).toBe("retry_later");
    expect(enqueue).toHaveBeenLastCalledWith(attempt(3), AUTO_REVIEW_RETRY_DELAYS_SEC[2]);
    expect(await svc.run(attempt(AUTO_REVIEW_RETRY_DELAYS_SEC.length))).toBe("gave_up");
  });

  it("retries when OpenDota is busy, but not when the AI budget is spent or the model failed", async () => {
    const busy = setup({
      review: async () => {
        throw new RateLimitedError("OpenDota is busy");
      },
    });
    expect(await busy.svc.run(attempt())).toBe("retry_later");
    const down = setup({
      review: async () => {
        throw new UpstreamUnavailableError("OpenDota is unavailable");
      },
    });
    expect(await down.svc.run(attempt())).toBe("retry_later");
    const resting = setup({
      review: async () => {
        throw new AppError("upstream_unavailable", "resting", { reason: "resting" });
      },
    });
    expect(await resting.svc.run(attempt())).toBe("budget_spent");
    expect(resting.enqueue).not.toHaveBeenCalled();
    const failed = setup({
      review: async () => {
        throw new AppError("upstream_unavailable", "failed", { reason: "failed" });
      },
    });
    expect(await failed.svc.run(attempt())).toBe("failed");
  });

  it("checks Plus and the setting again on every attempt", async () => {
    expect(await setup({ isPlus: async () => false }).svc.run(attempt())).toBe("not_plus");
    expect(await setup({ wants: async () => false }).svc.run(attempt())).toBe("turned_off");
    expect(await setup({ user: async () => null }).svc.run(attempt())).toBe("no_user");
  });

  it("refuses a malformed payload", async () => {
    const { svc, review } = setup();
    expect(await svc.run({ userId: "x", matchId: "900", attempt: 0 })).toBe("failed");
    expect(await svc.run({ userId: USER, matchId: "9; drop", attempt: 0 })).toBe("failed");
    expect(review).not.toHaveBeenCalled();
  });
});
