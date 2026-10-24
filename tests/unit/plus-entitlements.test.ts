import { describe, expect, it } from "vitest";
import {
  entitlementFor,
  entitlementOf,
  PAST_DUE_GRACE_MS,
  stillBills,
  summarise,
} from "@/modules/plus/domain/entitlement";
import {
  aiReviewAllowance,
  limitFor,
  PLAN_PRICES,
  PLUS_LIMIT_MULTIPLIER,
} from "@/modules/plus/domain/plans";
import { plus as en } from "@/common/i18n/messages/en/plus";
import {
  applySnapshot,
  type Subscription,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from "@/modules/plus/domain/subscription";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-23T12:00:00.000Z");
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    provider: "lemonsqueezy",
    subscriptionId: "1",
    userId: "u1",
    accountId32: 1,
    status: "active",
    plan: "monthly",
    variantId: "10",
    customerId: "5",
    renewsAt: at("2026-11-23T12:00:00.000Z"),
    endsAt: null,
    trialEndsAt: null,
    providerUpdatedAt: at("2026-10-23T11:00:00.000Z"),
    testMode: false,
    portalUrl: null,
    portalUrlAt: null,
    pastDueSince: null,
    createdAt: at("2026-10-01T00:00:00.000Z"),
    updatedAt: at("2026-10-23T11:00:00.000Z"),
    ...over,
  };
}

describe("entitlementOf", () => {
  const periodEnd = at("2026-10-30T00:00:00.000Z");
  const failedAt = at("2026-10-20T12:00:00.000Z");
  const cases: Array<{
    name: string;
    sub: Partial<Subscription>;
    now?: Date;
    plus: boolean;
    reason: string;
    until?: Date | null;
  }> = [
    { name: "active", sub: { status: "active" }, plus: true, reason: "active", until: null },
    { name: "on trial", sub: { status: "on_trial" }, plus: true, reason: "trial" },
    {
      name: "active for a few days after renews_at (a renewal webhook can be late)",
      sub: { status: "active", renewsAt: at("2026-10-21T00:00:00Z") },
      plus: true,
      reason: "active",
    },
    {
      name: "not weeks after renews_at with no news (the renewal's webhook was lost)",
      sub: { status: "active", renewsAt: at("2026-10-01T00:00:00Z") },
      plus: false,
      reason: "none",
    },
    {
      name: "a trial whose end passed long ago without news",
      sub: { status: "on_trial", renewsAt: at("2026-10-01T00:00:00Z") },
      plus: false,
      reason: "none",
    },
    { name: "paused", sub: { status: "paused" }, plus: false, reason: "none" },
    { name: "unpaid", sub: { status: "unpaid" }, plus: false, reason: "none" },
    { name: "expired", sub: { status: "expired" }, plus: false, reason: "none" },
    {
      name: "past due inside the grace period",
      sub: { status: "past_due", pastDueSince: failedAt },
      plus: true,
      reason: "grace",
      until: ms(failedAt, PAST_DUE_GRACE_MS),
    },
    {
      name: "past due one millisecond before grace ends",
      sub: { status: "past_due", pastDueSince: failedAt },
      now: ms(failedAt, PAST_DUE_GRACE_MS - 1),
      plus: true,
      reason: "grace",
    },
    {
      name: "past due exactly when grace ends",
      sub: { status: "past_due", pastDueSince: failedAt },
      now: ms(failedAt, PAST_DUE_GRACE_MS),
      plus: false,
      reason: "none",
    },
    {
      name: "past due without a recorded start counts from the provider's update",
      sub: { status: "past_due", pastDueSince: null, providerUpdatedAt: at("2026-10-01T00:00Z") },
      plus: false,
      reason: "none",
    },
    {
      name: "cancelled before the period end",
      sub: { status: "cancelled", endsAt: periodEnd },
      plus: true,
      reason: "cancelled_until_period_end",
      until: periodEnd,
    },
    {
      name: "cancelled one millisecond before the period end",
      sub: { status: "cancelled", endsAt: periodEnd },
      now: ms(periodEnd, -1),
      plus: true,
      reason: "cancelled_until_period_end",
    },
    {
      name: "cancelled exactly at the period end",
      sub: { status: "cancelled", endsAt: periodEnd },
      now: periodEnd,
      plus: false,
      reason: "none",
    },
    {
      name: "cancelled without ends_at falls back to renews_at",
      sub: { status: "cancelled", endsAt: null, renewsAt: periodEnd },
      plus: true,
      reason: "cancelled_until_period_end",
      until: periodEnd,
    },
    {
      name: "cancelled with no date at all",
      sub: { status: "cancelled", endsAt: null, renewsAt: null },
      plus: false,
      reason: "none",
    },
  ];
  it.each(cases)("$name", ({ sub: over, now, plus, reason, until }) => {
    const e = entitlementOf(sub(over), now ?? NOW);
    expect(e.plus).toBe(plus);
    expect(e.reason).toBe(reason);
    if (until !== undefined) expect(e.until).toEqual(until);
  });
});

describe("entitlementFor", () => {
  it("is free with no subscriptions", () => {
    expect(entitlementFor([], NOW, true)).toEqual({ plus: false, reason: "none", until: null });
  });

  it("the kill switch makes everyone free, whatever is stored", () => {
    expect(entitlementFor([sub()], NOW, false)).toEqual({
      plus: false,
      reason: "disabled",
      until: null,
    });
  });

  it("the best subscription wins; between two time-limited ones, the later end", () => {
    const expired = sub({ subscriptionId: "a", status: "expired" });
    const cancelledSoon = sub({
      subscriptionId: "b",
      status: "cancelled",
      endsAt: at("2026-10-25T00:00:00Z"),
    });
    const cancelledLater = sub({
      subscriptionId: "c",
      status: "cancelled",
      endsAt: at("2026-11-25T00:00:00Z"),
    });
    expect(entitlementFor([expired, cancelledSoon, cancelledLater], NOW, true)).toMatchObject({
      plus: true,
      until: at("2026-11-25T00:00:00Z"),
    });
    expect(entitlementFor([cancelledLater, sub({ status: "active" })], NOW, true).reason).toBe(
      "active",
    );
  });
});

describe("summarise and stillBills", () => {
  it("describes the granting subscription, else the newest", () => {
    const old = sub({ subscriptionId: "old", status: "expired", plan: "yearly" });
    const current = sub({
      subscriptionId: "new",
      status: "cancelled",
      endsAt: at("2026-11-01T00:00:00Z"),
      providerUpdatedAt: at("2026-10-01T00:00:00Z"),
    });
    const s = summarise([old, current], NOW, true);
    expect(s).toMatchObject({ status: "cancelled", plan: "monthly" });
    expect(summarise([old], NOW, true)).toMatchObject({ status: "expired", plan: "yearly" });
    expect(summarise([], NOW, true)).toMatchObject({ status: null, plan: null });
  });

  it.each<[SubscriptionStatus, boolean]>([
    ["active", true],
    ["on_trial", true],
    ["past_due", true],
    ["paused", true],
    ["unpaid", true],
    ["cancelled", false],
    ["expired", false],
  ])("warns before account deletion when %s: %s", (status, bills) => {
    expect(stillBills([{ status }])).toBe(bills);
  });
});

describe("limits and the AI review allowance", () => {
  it("doubles existing caps for Plus only, never lowering the free cap", () => {
    expect(PLUS_LIMIT_MULTIPLIER).toBe(2);
    expect(limitFor(100, false)).toBe(100);
    expect(limitFor(100, true)).toBe(200);
    expect(limitFor(5, true)).toBe(10);
  });

  it("keeps free on today's (standard) review and makes Plus unlimited", () => {
    expect(aiReviewAllowance(false)).toBe("standard");
    expect(aiReviewAllowance(true)).toBe("unlimited");
  });
});

describe("applySnapshot", () => {
  const snapshot = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => {
    const {
      userId: _u,
      accountId32: _a,
      pastDueSince: _p,
      portalUrlAt: _pa,
      createdAt: _c,
      updatedAt: _up,
      ...rest
    } = sub();
    return { ...rest, userId: "u1", ...over };
  };
  const link = { userId: "u1", accountId32: 1 };

  it("creates a new subscription linked to the user", () => {
    const r = applySnapshot(null, snapshot(), link, NOW);
    expect(r.kind).toBe("apply");
    if (r.kind === "apply")
      expect(r.next).toMatchObject({
        userId: "u1",
        accountId32: 1,
        createdAt: NOW,
        updatedAt: NOW,
      });
  });

  it("ignores an event older than the stored state (out of order)", () => {
    const stored = sub({ providerUpdatedAt: at("2026-10-23T11:00:00Z"), status: "cancelled" });
    const older = snapshot({ providerUpdatedAt: at("2026-10-23T10:59:59Z"), status: "active" });
    expect(applySnapshot(stored, older, link, NOW)).toEqual({ kind: "stale" });
  });

  it("applies an event with the same or a newer updated_at", () => {
    const stored = sub();
    expect(applySnapshot(stored, snapshot({ status: "cancelled" }), link, NOW).kind).toBe("apply");
  });

  it("keeps the user link when a later event has no custom data", () => {
    const stored = sub({ userId: "u1", accountId32: 1 });
    const r = applySnapshot(
      stored,
      snapshot({ userId: null, providerUpdatedAt: at("2026-10-24T00:00:00Z") }),
      null,
      NOW,
    );
    expect(r.kind === "apply" && r.next.userId).toBe("u1");
  });

  it("starts the past-due clock once and clears it when paid", () => {
    const first = at("2026-10-20T00:00:00Z");
    const r1 = applySnapshot(
      null,
      snapshot({ status: "past_due", providerUpdatedAt: first }),
      link,
      NOW,
    );
    expect(r1.kind === "apply" && r1.next.pastDueSince).toEqual(first);
    const stored = sub({ status: "past_due", pastDueSince: first, providerUpdatedAt: first });
    const r2 = applySnapshot(
      stored,
      snapshot({ status: "past_due", providerUpdatedAt: at("2026-10-22T00:00:00Z") }),
      link,
      NOW,
    );
    expect(r2.kind === "apply" && r2.next.pastDueSince).toEqual(first);
    const r3 = applySnapshot(
      stored,
      snapshot({ status: "active", providerUpdatedAt: at("2026-10-23T00:00:00Z") }),
      link,
      NOW,
    );
    expect(r3.kind === "apply" && r3.next.pastDueSince).toBeNull();
  });

  it("remembers when a portal link arrived and keeps the last one", () => {
    const r = applySnapshot(
      null,
      snapshot({ portalUrl: "https://x.lemonsqueezy.com/p" }),
      link,
      NOW,
    );
    expect(r.kind === "apply" && r.next.portalUrlAt).toEqual(NOW);
    const stored = sub({ portalUrl: "https://x/p", portalUrlAt: at("2026-10-23T00:00:00Z") });
    const r2 = applySnapshot(stored, snapshot({ portalUrl: null }), link, NOW);
    expect(r2.kind === "apply" && r2.next).toMatchObject({
      portalUrl: "https://x/p",
      portalUrlAt: at("2026-10-23T00:00:00Z"),
    });
  });
});

describe("plan prices", () => {
  const pesos = (amount: string) => Number(amount.replace(/[^\d.]/g, ""));

  it('yearly is ten months\' price, as the pricing page says ("2 months free")', () => {
    expect(pesos(PLAN_PRICES.yearly.amount)).toBe(10 * pesos(PLAN_PRICES.monthly.amount));
    expect(en.page.yearlySaving).toContain("2 months free");
  });
});
