import { describe, expect, it, vi } from "vitest";
import { entitlementFor } from "@/modules/plus/domain/entitlement";
import type { Subscription } from "@/modules/plus/domain/subscription";
import { newTrial, TRIAL_MS, trialEntitlement, trialStatus } from "@/modules/plus/domain/trial";
import type { BillingProvider } from "@/modules/plus/plus.ports";
import { PlusService } from "@/modules/plus/services/plus.service";
import { MemorySubscriptions, MemoryTrials, MemoryWebhookEvents } from "../support/plus-fakes";

const USER = "a".repeat(24);
const OTHER = "b".repeat(24);
const NOW = new Date("2026-11-23T12:00:00Z");
const DAY = 24 * 3_600_000;

const provider = {
  name: "polar",
  plans: ["monthly", "yearly"],
  testMode: false,
  portalUrl: null,
  verify: () => false,
  parse: () => null,
  checkoutUrl: async () => "https://checkout.example/x",
} as unknown as BillingProvider;

function setup(opts: { enabled?: boolean; staff?: string[] } = {}) {
  let now = NOW;
  const subscriptions = new MemorySubscriptions();
  const trials = new MemoryTrials();
  const plus = new PlusService({
    subscriptions,
    events: new MemoryWebhookEvents(),
    trials,
    provider,
    enabled: () => opts.enabled ?? true,
    staff: {
      has: async (id) => (opts.staff ?? []).includes(id),
      userIds: async () => opts.staff ?? [],
    },
    logger: { warn: vi.fn() },
    now: () => now,
  });
  return {
    plus,
    subscriptions,
    trials,
    later: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

const subscription = (over: Partial<Subscription> = {}): Subscription =>
  ({
    provider: "polar",
    subscriptionId: "sub_1",
    userId: USER,
    accountId32: 7,
    status: "active",
    plan: "monthly",
    testMode: false,
    renewsAt: new Date(NOW.getTime() + 30 * DAY),
    endsAt: null,
    pastDueSince: null,
    providerUpdatedAt: NOW,
    portalUrl: null,
    portalUrlAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Subscription;

describe("free trial rules", () => {
  it("lasts 7 days, then grants nothing", () => {
    const trial = newTrial(USER, 7, NOW);
    expect(trial.endsAt.getTime() - NOW.getTime()).toBe(TRIAL_MS);
    expect(trialEntitlement(trial, new Date(NOW.getTime() + 6 * DAY))).toEqual({
      plus: true,
      reason: "free_trial",
      until: trial.endsAt,
    });
    expect(trialEntitlement(trial, trial.endsAt)).toBeNull();
    expect(trialEntitlement(null, NOW)).toBeNull();
  });

  it("is offered only to players who never had Plus, while it's on sale", () => {
    const base = { trial: null, now: NOW, onSale: true, otherPlus: false, everSubscribed: false };
    expect(trialStatus(base)).toBe("available");
    expect(trialStatus({ ...base, onSale: false })).toBe("none");
    expect(trialStatus({ ...base, otherPlus: true })).toBe("none");
    expect(trialStatus({ ...base, everSubscribed: true })).toBe("none");
    const trial = newTrial(USER, 7, NOW);
    expect(trialStatus({ ...base, trial })).toBe("active");
    expect(trialStatus({ ...base, trial, now: trial.endsAt })).toBe("used");
    // Subscribed during the trial: the subscription is what counts now.
    expect(trialStatus({ ...base, trial, otherPlus: true })).toBe("used");
  });

  it("ranks below any paid state", () => {
    expect(entitlementFor([subscription()], NOW, true).reason).toBe("active");
  });
});

describe("PlusService free trial", () => {
  it("starts once per account, gives Plus for 7 days, then ends by itself", async () => {
    const { plus, later } = setup();
    expect((await plus.plan(USER)).trial).toEqual({ status: "available", endsAt: null });

    const { endsAt } = await plus.startTrial(USER, 7);
    expect(endsAt.getTime() - NOW.getTime()).toBe(TRIAL_MS);
    expect(await plus.isPlus(USER)).toBe(true);
    expect(await plus.plan(USER)).toMatchObject({
      plus: true,
      reason: "free_trial",
      until: endsAt.toISOString(),
      trial: { status: "active", endsAt: endsAt.toISOString() },
      canManage: false,
      stillBills: false,
    });
    // Trial users get the Plus features that run for Plus players...
    expect(await plus.plusUserIds()).toEqual([USER]);
    // ...but no supporter badge: they aren't paying.
    expect(await plus.supporters([7])).toEqual(new Set());
    expect((await plus.adminCounts()).trials).toEqual({ started: 1, active: 1 });

    await expect(plus.startTrial(USER, 7)).rejects.toMatchObject({ statusCode: 409 });

    later(7 * DAY);
    expect(await plus.isPlus(USER)).toBe(false);
    expect((await plus.plan(USER)).trial.status).toBe("used");
    await expect(plus.startTrial(USER, 7)).rejects.toMatchObject({ statusCode: 409 });
    expect(await plus.plusUserIds()).toEqual([]);
  });

  it("is one per Steam account, even for a new user id on the same account", async () => {
    const { plus } = setup();
    await plus.startTrial(USER, 7);
    await expect(plus.startTrial(OTHER, 7)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("isn't for players who subscribed before, have Plus, or when Plus isn't on sale", async () => {
    const a = setup();
    await a.subscriptions.upsertIfNewer(subscription({ status: "expired" }));
    expect((await a.plus.plan(USER)).trial.status).toBe("none");
    await expect(a.plus.startTrial(USER, 7)).rejects.toMatchObject({ statusCode: 409 });

    const staff = setup({ staff: [USER] });
    await expect(staff.plus.startTrial(USER, 7)).rejects.toMatchObject({ statusCode: 409 });

    const off = setup({ enabled: false });
    await expect(off.plus.startTrial(USER, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets a trial player subscribe, and the subscription takes over", async () => {
    const { plus, subscriptions } = setup();
    await plus.startTrial(USER, 7);
    await expect(plus.checkoutUrl(USER, "monthly")).resolves.toMatch(/^https:/);
    await subscriptions.upsertIfNewer(subscription());
    expect(await plus.plan(USER)).toMatchObject({
      reason: "active",
      trial: { status: "used", endsAt: null },
    });
    await expect(plus.checkoutUrl(USER, "monthly")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("the kill switch turns a running trial off too", async () => {
    const enabled = { on: true };
    const trials = new MemoryTrials();
    await trials.start(newTrial(USER, 7, NOW));
    const plus = new PlusService({
      subscriptions: new MemorySubscriptions(),
      events: new MemoryWebhookEvents(),
      trials,
      provider,
      enabled: () => enabled.on,
      logger: { warn: vi.fn() },
      now: () => NOW,
    });
    expect(await plus.isPlus(USER)).toBe(true);
    enabled.on = false;
    expect(await plus.isPlus(USER)).toBe(false);
    expect((await plus.plan(USER)).plus).toBe(false);
  });

  it("exports and deletes the trial with the account", async () => {
    const { plus, trials } = setup();
    await plus.startTrial(USER, 7);
    const owner = { userId: USER, accountId32: 7 };
    expect((await plus.exportMyData(owner)).plusFreeTrials).toHaveLength(1);
    expect((await plus.deleteMyData(owner)).plusFreeTrials).toBe(1);
    expect(trials.docs.size).toBe(0);
  });
});

describe("trials ending soon (reminders)", () => {
  it("lists trials ending within 36 hours whose players still rely on them", async () => {
    const { plus, trials, subscriptions, later } = setup();
    await plus.startTrial(USER, 7);
    await trials.start(newTrial(OTHER, 8, NOW));
    expect(await plus.trialsEndingSoon()).toEqual([]);

    later(6 * DAY); // both end in 24 hours
    expect((await plus.trialsEndingSoon()).map((t) => t.userId).sort()).toEqual([USER, OTHER]);

    // A player who subscribed meanwhile isn't reminded.
    await subscriptions.upsertIfNewer(subscription({ userId: OTHER, accountId32: 8 }));
    expect((await plus.trialsEndingSoon()).map((t) => t.userId)).toEqual([USER]);

    later(DAY); // ended
    expect(await plus.trialsEndingSoon()).toEqual([]);
  });
});
