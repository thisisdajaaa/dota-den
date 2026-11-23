import { ConflictError, NotFoundError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import {
  entitlementFor,
  entitlementOf,
  stillBills,
  summarise,
  type Entitlement,
} from "../domain/entitlement";
import { limitFor, type Plan } from "../domain/plans";
import {
  newTrial,
  TRIAL_REMINDER_WINDOW_MS,
  trialEntitlement,
  trialStatus,
  type FreeTrial,
} from "../domain/trial";
import type { BillingProviderName, Subscription } from "../domain/subscription";
import type {
  BillingProvider,
  SubscriptionsPort,
  TrialsPort,
  WebhookEventsPort,
} from "../plus.ports";
import type { PlanDto, PlusAdminCountsDto, PlusOfferDto } from "../dtos/responses/plus.dto";

/** A pre-signed portal link is valid 24 hours from when the provider made it; keep a margin. */
const PORTAL_LINK_MAX_AGE_MS = 23 * 3_600_000;

const STAFF: Entitlement = { plus: true, reason: "staff", until: null };

/**
 * Dota Den Plus: who has it, what it unlocks, and where to buy or manage it. Entitlements come
 * from stored subscription state only (written by verified webhooks), never from the browser.
 */
export class PlusService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      subscriptions: SubscriptionsPort;
      events: Pick<WebhookEventsPort, "exportForOwner" | "deleteForOwner">;
      /** Free trials; absent means none are offered. */
      trials?: TrialsPort;
      /** Null when no payment provider is configured: Plus doesn't exist on this server. */
      provider: BillingProvider | null;
      /** PLUS_ENABLED: false is the kill switch (everyone free, data kept). */
      enabled: () => boolean;
      /**
       * Admins have Plus without paying (testing and running the site), even while it isn't on
       * sale. No supporter badge: they aren't supporters.
       */
      staff?: { has(userId: string): Promise<boolean>; userIds(): Promise<string[]> };
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** The configured payment provider's name (the legal pages name it), or null. */
  get providerName(): BillingProviderName | null {
    return this.deps.provider?.name ?? null;
  }

  get configured(): boolean {
    return this.deps.provider !== null;
  }

  /** Plus grants anything only when configured and the kill switch is off. */
  get enabled(): boolean {
    return this.configured && this.deps.enabled();
  }

  offer(): PlusOfferDto {
    const provider = this.deps.provider;
    const name = provider?.name ?? null;
    if (!provider || provider.plans.length === 0)
      return { status: "off", plans: [], provider: name };
    if (!this.enabled) return { status: "paused", plans: [], provider: name };
    return { status: "available", plans: [...provider.plans], provider: name };
  }

  /**
   * Only subscriptions from this server's mode count. Staging (test mode) and production (live)
   * share one database, so a test purchase must never grant Plus in production, nor a live one
   * be managed from staging.
   */
  private ours(subs: readonly Subscription[]): Subscription[] {
    const testMode = this.deps.provider?.testMode;
    if (testMode === undefined) return [];
    return subs.filter((s) => s.testMode === testMode);
  }

  private async isStaff(userId: string): Promise<boolean> {
    return (await this.deps.staff?.has(userId).catch(() => false)) ?? false;
  }

  async entitlement(userId: string): Promise<Entitlement> {
    if (await this.isStaff(userId)) return STAFF;
    if (!this.enabled) return entitlementFor([], this.now(), false);
    const now = this.now();
    const [subs, trial] = await Promise.all([
      this.deps.subscriptions.forUser(userId),
      this.trialOf(userId),
    ]);
    return withTrial(entitlementFor(this.ours(subs), now, true), trial, now);
  }

  /** The player's free trial, or null (also when trials aren't wired or the lookup fails). */
  private async trialOf(userId: string, accountId32?: number): Promise<FreeTrial | null> {
    if (!this.deps.trials) return null;
    try {
      return await this.deps.trials.find(userId, accountId32);
    } catch (error) {
      this.deps.logger.warn("plus_trial_lookup_failed", { error });
      return null;
    }
  }

  /**
   * Trials ending within the reminder window whose players still depend on them (not those who
   * subscribed or became staff meanwhile). Empty when Plus is off or the lookup fails.
   */
  async trialsEndingSoon(): Promise<{ userId: string; endsAt: Date }[]> {
    if (!this.enabled || !this.deps.trials) return [];
    const now = this.now();
    try {
      const ending = await this.deps.trials.endingBetween(
        now,
        new Date(now.getTime() + TRIAL_REMINDER_WINDOW_MS),
      );
      const out: { userId: string; endsAt: Date }[] = [];
      for (const trial of ending)
        if ((await this.entitlement(trial.userId)).reason === "free_trial")
          out.push({ userId: trial.userId, endsAt: trial.endsAt });
      return out;
    } catch (error) {
      this.deps.logger.warn("plus_trial_reminders_failed", { error });
      return [];
    }
  }

  /**
   * Starts this player's 7-day free trial: no card, nothing charged, ends by itself. Only while
   * Plus is on sale, once per Steam account, and not for anyone who has Plus or ever had a
   * subscription. Answers when it ends.
   */
  async startTrial(userId: string, accountId32: number): Promise<{ endsAt: Date }> {
    if (!this.enabled || !this.deps.trials || this.offer().status !== "available")
      throw new NotFoundError("The free trial isn't available here.");
    const now = this.now();
    const [subs, trial, staff] = await Promise.all([
      this.deps.subscriptions.forUser(userId),
      this.deps.trials.find(userId, accountId32),
      this.isStaff(userId),
    ]);
    const ours = this.ours(subs);
    const status = trialStatus({
      trial,
      now,
      onSale: true,
      otherPlus: staff || entitlementFor(ours, now, true).plus,
      everSubscribed: ours.length > 0,
    });
    if (status === "active") throw new ConflictError("Your free trial is already running.");
    if (status !== "available")
      throw new ConflictError("The free trial is for players who haven't had Plus yet.", {
        reason: "trial_used",
      });
    const fresh = newTrial(userId, accountId32, now);
    if (!(await this.deps.trials.start(fresh)))
      throw new ConflictError("The free trial is for players who haven't had Plus yet.", {
        reason: "trial_used",
      });
    return { endsAt: fresh.endsAt };
  }

  async isPlus(userId: string): Promise<boolean> {
    return (await this.entitlement(userId)).plus;
  }

  /**
   * A cap that already exists for everyone, doubled with Plus. When the lookup fails the free
   * cap applies (never lower than today's).
   */
  async limit(userId: string, base: number): Promise<number> {
    try {
      return limitFor(base, await this.isPlus(userId));
    } catch (error) {
      this.deps.logger.warn("plus_limit_lookup_failed", { error });
      return base;
    }
  }

  /** Which of these Dota accounts have Plus (supporter badges). Empty on any failure. */
  async supporters(accountIds: readonly number[]): Promise<Set<number>> {
    if (!this.enabled || accountIds.length === 0) return new Set();
    try {
      const now = this.now();
      const subs = this.ours(await this.deps.subscriptions.possiblyEntitledForAccounts(accountIds));
      return new Set(
        subs
          .filter((s) => s.accountId32 !== null && entitlementOf(s, now).plus)
          .map((s) => s.accountId32!),
      );
    } catch (error) {
      this.deps.logger.warn("plus_supporters_lookup_failed", { error });
      return new Set();
    }
  }

  /** Users with Plus right now (staff included). Cheap when there are none. */
  async plusUserIds(): Promise<string[]> {
    const [paid, staff] = await Promise.all([
      this.paidUserIds(),
      this.deps.staff?.userIds().catch(() => []) ?? [],
    ]);
    return [...new Set([...paid, ...staff])];
  }

  /** Users with a subscription or a running free trial granting Plus right now. */
  private async paidUserIds(): Promise<string[]> {
    if (!this.enabled) return [];
    const now = this.now();
    const [subs, trials] = await Promise.all([
      this.deps.subscriptions.possiblyEntitled(),
      this.deps.trials?.activeUserIds(now).catch((error) => {
        this.deps.logger.warn("plus_trial_lookup_failed", { error });
        return [];
      }) ?? [],
    ]);
    return [
      ...new Set([
        ...this.ours(subs)
          .filter((s) => s.userId && entitlementOf(s, now).plus)
          .map((s) => s.userId!),
        ...trials,
      ]),
    ];
  }

  async plan(userId: string): Promise<PlanDto> {
    const [subs, trial, staff] = await Promise.all([
      this.configured
        ? this.deps.subscriptions.forUser(userId).then((all) => this.ours(all))
        : Promise.resolve([]),
      this.configured ? this.trialOf(userId) : Promise.resolve(null),
      this.isStaff(userId),
    ]);
    const now = this.now();
    const s = summarise(subs, now, this.enabled);
    const paid = !s.entitlement.plus && staff ? STAFF : s.entitlement;
    const entitlement = this.enabled ? withTrial(paid, trial, now) : paid;
    const trialEnd = entitlement.reason === "free_trial" ? trial!.endsAt.toISOString() : null;
    return {
      trial: {
        status: trialStatus({
          trial,
          now,
          onSale: this.offer().status === "available" && Boolean(this.deps.trials),
          otherPlus: paid.plus,
          everSubscribed: subs.length > 0,
        }),
        endsAt: trialEnd,
      },
      plus: entitlement.plus,
      reason: entitlement.reason,
      until: entitlement.until?.toISOString() ?? null,
      status: s.status,
      plan: s.plan,
      renewsAt: s.renewsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      canManage: subs.length > 0 && this.portalFor(subs, now) !== null,
      stillBills: stillBills(subs),
    };
  }

  /**
   * The provider's checkout for this player. Refused when Plus isn't on sale, when they have
   * it, and while a subscription of theirs can still charge (a failed renewal being retried,
   * paused, unpaid): a second purchase then could bill them twice.
   */
  async checkoutUrl(
    userId: string,
    plan: Plan,
    context: { ip?: string | null } = {},
  ): Promise<string> {
    const provider = this.deps.provider;
    if (!this.enabled || !provider || !provider.plans.includes(plan))
      throw new NotFoundError("Plus isn't available here yet.");
    // A free trial doesn't block buying: subscribing during it keeps Plus going after it ends.
    const current = await this.entitlement(userId);
    if (current.plus && current.reason !== "free_trial")
      throw new ConflictError("You already have Plus. Manage it from your account page.");
    if (stillBills(this.ours(await this.deps.subscriptions.forUser(userId))))
      throw new ConflictError(
        "You still have a Plus subscription. Update your payment or resume it from your account page.",
        { reason: "still_billing" },
      );
    const url = await provider.checkoutUrl(plan, userId, context);
    if (!url) throw new NotFoundError("Plus isn't available here yet.");
    return url;
  }

  /**
   * Where this player manages billing (update card, cancel): a signed-in portal link made on
   * demand when the provider offers one (Polar), else the pre-signed link from the latest
   * webhook while it's fresh (Lemon Squeezy), else the store's portal (sign-in by email).
   * Works with the kill switch on, so nobody is ever stuck paying.
   */
  async portalUrl(userId: string): Promise<string> {
    if (!this.configured) throw new NotFoundError("No subscription");
    const subs = this.ours(await this.deps.subscriptions.forUser(userId));
    if (subs.length === 0) throw new NotFoundError("No subscription");
    const session = await this.sessionPortal(subs);
    const url = session ?? this.portalFor(subs, this.now());
    if (!url) throw new NotFoundError("No subscription");
    return url;
  }

  /** A provider-made portal session for the most recent subscription's customer, if any. */
  private async sessionPortal(subs: readonly Subscription[]): Promise<string | null> {
    const provider = this.deps.provider;
    if (!provider?.customerPortalUrl) return null;
    const latest = [...subs]
      .filter((s) => s.provider === provider.name && s.customerId)
      .sort((a, b) => b.providerUpdatedAt.getTime() - a.providerUpdatedAt.getTime())[0];
    if (!latest) return null;
    try {
      return await provider.customerPortalUrl(latest.customerId!);
    } catch (error) {
      // The generic portal (sign-in by email code) still works.
      this.deps.logger.warn("plus_portal_session_failed", { error });
      return null;
    }
  }

  private portalFor(subs: readonly Subscription[], now: Date): string | null {
    const fresh = [...subs]
      .filter((s) => s.portalUrl && s.portalUrlAt)
      .sort((a, b) => b.portalUrlAt!.getTime() - a.portalUrlAt!.getTime())[0];
    if (fresh && now.getTime() - fresh.portalUrlAt!.getTime() < PORTAL_LINK_MAX_AGE_MS)
      return fresh.portalUrl;
    return this.deps.provider?.portalUrl ?? null;
  }

  async adminCounts(): Promise<PlusAdminCountsDto> {
    const [rows, entitled, trials] = await Promise.all([
      this.deps.subscriptions.countsByStatus(this.deps.provider?.testMode ?? null),
      this.configured ? this.paidUserIds() : Promise.resolve([]),
      this.deps.trials?.counts(this.now()).catch(() => null) ?? null,
    ]);
    const byStatus = new Map<string, number>();
    let unlinked = 0;
    for (const r of rows) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.count);
      if (!r.linked) unlinked += r.count;
    }
    return {
      configured: this.configured,
      enabled: this.enabled,
      byStatus: [...byStatus]
        .map(([status, count]) => ({ status: status as Subscription["status"], count }))
        .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
      unlinked,
      entitled: entitled.length,
      trials,
    };
  }

  async exportMyData(owner: DataOwner) {
    const [subscriptions, events, trials] = await Promise.all([
      this.deps.subscriptions.exportForOwner(owner),
      this.deps.events.exportForOwner(owner),
      this.deps.trials?.exportForOwner(owner) ?? [],
    ]);
    return {
      plusSubscriptions: subscriptions,
      plusBillingEvents: events,
      plusFreeTrials: trials,
      plusBillingNote:
        "Payment details, invoices and your billing address are kept by our payment provider (the merchant of record), not by Dota Den.",
    };
  }

  /**
   * Deletes the local subscription record and webhook log. The subscription at the provider
   * isn't cancelled by this (the account page warns first); billing records stay with them.
   */
  async deleteMyData(owner: DataOwner) {
    const [subscriptions, events, trials] = await Promise.all([
      this.deps.subscriptions.deleteForOwner(owner),
      this.deps.events.deleteForOwner(owner),
      this.deps.trials?.deleteForOwner(owner) ?? 0,
    ]);
    return { plusSubscriptions: subscriptions, plusBillingEvents: events, plusFreeTrials: trials };
  }
}

/** A paid (or staff) entitlement wins; otherwise a running free trial grants Plus. */
function withTrial(e: Entitlement, trial: FreeTrial | null, now: Date): Entitlement {
  if (e.plus) return e;
  return trialEntitlement(trial, now) ?? e;
}
