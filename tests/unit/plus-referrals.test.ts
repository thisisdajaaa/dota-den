import { describe, expect, it, vi } from "vitest";
import {
  claimRefusal,
  freePlus,
  newReferralCode,
  nextGrantStart,
  normalizeReferralCode,
  REFERRAL_CLAIM_WINDOW_MS,
  REFERRAL_MAX_REWARDS,
  REFERRAL_MIN_MATCHES,
  REFERRAL_MS,
  REFERRAL_PENDING_MS,
  settleAction,
} from "@/modules/plus/domain/referral";
import { newTrial, TRIAL_MS } from "@/modules/plus/domain/trial";
import type { BillingProvider } from "@/modules/plus/plus.ports";
import { PlusService } from "@/modules/plus/services/plus.service";
import { ReferralService } from "@/modules/plus/services/referral.service";
import {
  MemoryGrants,
  MemoryReferrals,
  MemorySubscriptions,
  MemoryTrials,
  MemoryWebhookEvents,
} from "../support/plus-fakes";

const NOW = new Date("2026-11-26T12:00:00Z");
const DAY = 24 * 3_600_000;
const INVITER = "a".repeat(24);
const FRIEND = "b".repeat(24);

const provider = {
  name: "polar",
  plans: ["monthly", "yearly"],
  testMode: false,
  portalUrl: null,
  verify: () => false,
  parse: () => null,
  checkoutUrl: async () => "https://checkout.example/x",
} as unknown as BillingProvider;

describe("referral rules", () => {
  it("makes readable codes and accepts them typed in capitals", () => {
    let i = 0;
    const code = newReferralCode(() => i++ % 31);
    expect(code).toMatch(/^[2-9a-z]{8}$/);
    expect(normalizeReferralCode(` ${code.toUpperCase()} `)).toBe(code);
    expect(normalizeReferralCode("0000oooo")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it("refuses your own link, an old account, a second invite and past subscribers", () => {
    const referrer = { userId: INVITER, accountId32: 1 };
    const friend = { userId: FRIEND, accountId32: 2, createdAt: NOW };
    const base = { referrer, friend, now: NOW, alreadyReferred: false, everSubscribed: false };
    expect(claimRefusal(base)).toBeNull();
    expect(claimRefusal({ ...base, friend: { ...friend, userId: INVITER } })).toBe("own_code");
    expect(claimRefusal({ ...base, friend: { ...friend, accountId32: 1 } })).toBe("own_code");
    expect(claimRefusal({ ...base, alreadyReferred: true })).toBe("already_referred");
    expect(
      claimRefusal({
        ...base,
        friend: { ...friend, createdAt: new Date(NOW.getTime() - REFERRAL_CLAIM_WINDOW_MS - 1) },
      }),
    ).toBe("not_new");
    expect(claimRefusal({ ...base, everSubscribed: true })).toBe("had_plus");
  });

  it("waits for real games, then rewards; lapses after 30 days", () => {
    const r = { status: "pending" as const, claimedAt: NOW };
    expect(settleAction(r, REFERRAL_MIN_MATCHES - 1, NOW)).toBe("wait");
    expect(settleAction(r, REFERRAL_MIN_MATCHES, NOW)).toBe("reward");
    expect(settleAction(r, 0, new Date(NOW.getTime() + REFERRAL_PENDING_MS))).toBe("expire");
    expect(settleAction({ ...r, status: "rewarded" }, 50, NOW)).toBe("none");
  });

  it("chains a week after free Plus already running", () => {
    const trial = {
      reason: "free_trial" as const,
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + TRIAL_MS),
    };
    expect(nextGrantStart([], NOW)).toEqual(NOW);
    expect(nextGrantStart([trial], NOW)).toEqual(trial.endsAt);
    const week = {
      reason: "referral" as const,
      startsAt: trial.endsAt,
      endsAt: new Date(trial.endsAt.getTime() + REFERRAL_MS),
    };
    // During the trial, Plus runs on to the end of the week after it.
    expect(freePlus([trial, week], NOW)).toEqual({
      plus: true,
      reason: "free_trial",
      until: week.endsAt,
    });
    expect(freePlus([trial, week], new Date(trial.endsAt.getTime() + DAY))).toEqual({
      plus: true,
      reason: "referral",
      until: week.endsAt,
    });
    expect(freePlus([trial, week], week.endsAt)).toBeNull();
  });
});

function setup(opts: { enabled?: boolean; friendCreated?: Date; matches?: number } = {}) {
  let now = NOW;
  let matches = opts.matches ?? 0;
  const subscriptions = new MemorySubscriptions();
  const trials = new MemoryTrials();
  const grants = new MemoryGrants();
  const referrals = new MemoryReferrals();
  const plus = new PlusService({
    subscriptions,
    events: new MemoryWebhookEvents(),
    trials,
    grants,
    referrals,
    provider,
    enabled: () => opts.enabled ?? true,
    logger: { warn: vi.fn() },
    now: () => now,
  });
  const users = new Map([
    [INVITER, { id: INVITER, accountId32: 1, createdAt: new Date(NOW.getTime() - 90 * DAY) }],
    [FRIEND, { id: FRIEND, accountId32: 2, createdAt: opts.friendCreated ?? NOW }],
  ]);
  let seq = 0;
  const service = new ReferralService({
    referrals,
    grants,
    plus,
    users: { byId: async (id) => users.get(id) ?? null },
    matchCounts: async (ids) => new Map(ids.map((id) => [id, id === 1 ? 500 : matches])),
    randomInt: (n) => seq++ % n,
    logger: { warn: vi.fn() },
    now: () => now,
  });
  return {
    plus,
    service,
    grants,
    trials,
    referrals,
    subscriptions,
    users,
    setMatches: (n: number) => (matches = n),
    later: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe("ReferralService", () => {
  it("gives both a week once the friend's games are imported, and only once", async () => {
    const s = setup();
    const invite = await s.service.invite({ id: INVITER, accountId32: 1 });
    expect(invite).toMatchObject({ available: true, joined: 0, waiting: 0, earned: 0 });
    // The same code on every visit.
    expect((await s.service.invite({ id: INVITER, accountId32: 1 })).code).toBe(invite.code);

    expect(await s.service.claim(FRIEND, invite.code)).toEqual({ status: "waiting" });
    expect(await s.plus.isPlus(FRIEND)).toBe(false);
    expect((await s.service.invite({ id: INVITER, accountId32: 1 })).waiting).toBe(1);

    s.setMatches(REFERRAL_MIN_MATCHES);
    await s.service.settleOwn({ id: FRIEND, accountId32: 2 });
    for (const id of [FRIEND, INVITER])
      expect(await s.plus.entitlement(id)).toEqual({
        plus: true,
        reason: "referral",
        until: new Date(NOW.getTime() + REFERRAL_MS),
      });
    expect(await s.service.invite({ id: INVITER, accountId32: 1 })).toMatchObject({
      joined: 1,
      waiting: 0,
      earned: 1,
    });
    // Again: nothing more.
    expect(await s.service.claim(FRIEND, invite.code)).toEqual({ status: "rewarded" });
    expect(s.grants.docs.size).toBe(2);
    expect((await s.plus.adminCounts()).referrals).toEqual({ claimed: 1, pending: 0, rewarded: 1 });
  });

  it("starts the friend's week after their running trial", async () => {
    const s = setup({ matches: REFERRAL_MIN_MATCHES });
    await s.trials.start(newTrial(FRIEND, 2, NOW));
    const { code } = await s.service.invite({ id: INVITER, accountId32: 1 });
    expect(await s.service.claim(FRIEND, code)).toEqual({ status: "rewarded" });
    const e = await s.plus.entitlement(FRIEND);
    expect(e.reason).toBe("free_trial");
    expect(e.until).toEqual(new Date(NOW.getTime() + TRIAL_MS + REFERRAL_MS));
    // No "trial ends tomorrow" push while the week carries Plus on.
    s.later(TRIAL_MS - DAY);
    expect(await s.plus.trialsEndingSoon()).toEqual([]);
  });

  it("refuses unknown codes, your own link, old accounts and a second invite", async () => {
    const s = setup({ friendCreated: new Date(NOW.getTime() - 30 * DAY) });
    const { code } = await s.service.invite({ id: INVITER, accountId32: 1 });
    await expect(s.service.claim(FRIEND, "zzzzzzzz")).rejects.toMatchObject({ code: "not_found" });
    await expect(s.service.claim(INVITER, code)).rejects.toMatchObject({
      details: { reason: "own_code" },
    });
    await expect(s.service.claim(FRIEND, code)).rejects.toMatchObject({
      details: { reason: "not_new" },
    });

    const fresh = setup();
    const a = await fresh.service.invite({ id: INVITER, accountId32: 1 });
    fresh.users.set("c".repeat(24), {
      id: "c".repeat(24),
      accountId32: 3,
      createdAt: new Date(NOW.getTime() - 90 * DAY),
    });
    const b = await fresh.service.invite({ id: "c".repeat(24), accountId32: 3 });
    await fresh.service.claim(FRIEND, a.code);
    await expect(fresh.service.claim(FRIEND, b.code)).rejects.toMatchObject({
      details: { reason: "already_referred" },
    });
  });

  it("caps the inviter's weeks; friends still get theirs", async () => {
    const s = setup({ matches: REFERRAL_MIN_MATCHES });
    const { code } = await s.service.invite({ id: INVITER, accountId32: 1 });
    for (let i = 0; i <= REFERRAL_MAX_REWARDS; i++) {
      const id = `f${String(i).padStart(23, "0")}`;
      s.users.set(id, { id, accountId32: 100 + i, createdAt: NOW });
      expect(await s.service.claim(id, code)).toEqual({ status: "rewarded" });
      expect(await s.plus.isPlus(id)).toBe(true);
    }
    const inviterWeeks = (await s.grants.forUser(INVITER)).length;
    expect(inviterWeeks).toBe(REFERRAL_MAX_REWARDS);
    // Chained one after another, not all at once.
    expect((await s.plus.entitlement(INVITER)).until).toEqual(
      new Date(NOW.getTime() + REFERRAL_MAX_REWARDS * REFERRAL_MS),
    );
    expect(await s.service.invite({ id: INVITER, accountId32: 1 })).toMatchObject({
      joined: REFERRAL_MAX_REWARDS + 1,
      earned: REFERRAL_MAX_REWARDS,
    });
  });

  it("is off with the kill switch: no codes, no claims, granted weeks don't count", async () => {
    const s = setup({ enabled: false, matches: REFERRAL_MIN_MATCHES });
    expect((await s.service.invite({ id: INVITER, accountId32: 1 })).available).toBe(false);
    await expect(s.service.claim(FRIEND, "abcdefgh")).rejects.toMatchObject({ code: "not_found" });
    await s.grants.give({
      id: "referral:2:friend",
      userId: FRIEND,
      accountId32: 2,
      source: "referral",
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + REFERRAL_MS),
      createdAt: NOW,
    });
    expect(await s.plus.isPlus(FRIEND)).toBe(false);
  });

  it("lets a waiting claim lapse after 30 days", async () => {
    const s = setup();
    const { code } = await s.service.invite({ id: INVITER, accountId32: 1 });
    await s.service.claim(FRIEND, code);
    s.later(REFERRAL_PENDING_MS);
    s.setMatches(REFERRAL_MIN_MATCHES);
    expect(await s.service.claim(FRIEND, code)).toEqual({ status: "expired" });
    expect(await s.plus.isPlus(FRIEND)).toBe(false);
  });

  it("a friend on an earned week can still subscribe", async () => {
    const s = setup({ matches: REFERRAL_MIN_MATCHES });
    const { code } = await s.service.invite({ id: INVITER, accountId32: 1 });
    await s.service.claim(FRIEND, code);
    // The friend on an earned week can still subscribe.
    await expect(s.plus.checkoutUrl(FRIEND, "monthly")).resolves.toBe("https://checkout.example/x");
  });
});
