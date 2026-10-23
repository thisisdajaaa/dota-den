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
import type { Subscription } from "../domain/subscription";
import type { BillingProvider, SubscriptionsPort, WebhookEventsPort } from "../plus.ports";
import type { PlanDto, PlusAdminCountsDto, PlusOfferDto } from "../dtos/responses/plus.dto";

/** A pre-signed portal link is valid 24 hours from when the provider made it; keep a margin. */
const PORTAL_LINK_MAX_AGE_MS = 23 * 3_600_000;

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
      /** Null when no payment provider is configured: Plus doesn't exist on this server. */
      provider: BillingProvider | null;
      /** PLUS_ENABLED: false is the kill switch (everyone free, data kept). */
      enabled: () => boolean;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
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
    if (!provider || provider.plans.length === 0) return { status: "off", plans: [] };
    if (!this.enabled) return { status: "paused", plans: [] };
    return { status: "available", plans: [...provider.plans] };
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

  async entitlement(userId: string): Promise<Entitlement> {
    if (!this.enabled) return entitlementFor([], this.now(), false);
    return entitlementFor(
      this.ours(await this.deps.subscriptions.forUser(userId)),
      this.now(),
      true,
    );
  }

  async isPlus(userId: string): Promise<boolean> {
    return (await this.entitlement(userId)).plus;
  }

  /**
   * A cap that already exists for everyone, doubled with Plus. When the lookup fails the free
   * cap applies (never lower than today's).
   */
  async limit(userId: string, base: number): Promise<number> {
    if (!this.enabled) return base;
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

  /** Users with Plus right now. Cheap when there are none (one indexed query). */
  async plusUserIds(): Promise<string[]> {
    if (!this.enabled) return [];
    const now = this.now();
    const subs = this.ours(await this.deps.subscriptions.possiblyEntitled());
    return [
      ...new Set(subs.filter((s) => s.userId && entitlementOf(s, now).plus).map((s) => s.userId!)),
    ];
  }

  async plan(userId: string): Promise<PlanDto> {
    const subs = this.configured ? this.ours(await this.deps.subscriptions.forUser(userId)) : [];
    const now = this.now();
    const s = summarise(subs, now, this.enabled);
    return {
      plus: s.entitlement.plus,
      reason: s.entitlement.reason,
      until: s.entitlement.until?.toISOString() ?? null,
      status: s.status,
      plan: s.plan,
      renewsAt: s.renewsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      canManage: subs.length > 0 && this.portalFor(subs, now) !== null,
      stillBills: stillBills(subs),
    };
  }

  /** The provider's checkout for this player. Refused when Plus isn't on sale or they have it. */
  async checkoutUrl(userId: string, plan: Plan): Promise<string> {
    const provider = this.deps.provider;
    if (!this.enabled || !provider || !provider.plans.includes(plan))
      throw new NotFoundError("Plus isn't available here yet.");
    if (await this.isPlus(userId))
      throw new ConflictError("You already have Plus. Manage it from your account page.");
    const url = provider.checkoutUrl(plan, userId);
    if (!url) throw new NotFoundError("Plus isn't available here yet.");
    return url;
  }

  /**
   * Where this player manages billing (update card, cancel): the pre-signed link from the
   * latest webhook while it's fresh, else the store's portal (sign-in by email link). Works
   * with the kill switch on, so nobody is ever stuck paying.
   */
  async portalUrl(userId: string): Promise<string> {
    if (!this.configured) throw new NotFoundError("No subscription");
    const subs = this.ours(await this.deps.subscriptions.forUser(userId));
    const url = subs.length > 0 ? this.portalFor(subs, this.now()) : null;
    if (!url) throw new NotFoundError("No subscription");
    return url;
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
    const [rows, entitled] = await Promise.all([
      this.deps.subscriptions.countsByStatus(),
      this.configured ? this.plusUserIds() : Promise.resolve([]),
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
    };
  }

  async exportMyData(owner: DataOwner) {
    const [subscriptions, events] = await Promise.all([
      this.deps.subscriptions.exportForOwner(owner),
      this.deps.events.exportForOwner(owner),
    ]);
    return {
      plusSubscriptions: subscriptions,
      plusBillingEvents: events,
      plusBillingNote:
        "Payment details, invoices and your billing address are kept by our payment provider (the merchant of record), not by Dota Den.",
    };
  }

  /**
   * Deletes the local subscription record and webhook log. The subscription at the provider
   * isn't cancelled by this (the account page warns first); billing records stay with them.
   */
  async deleteMyData(owner: DataOwner) {
    const [subscriptions, events] = await Promise.all([
      this.deps.subscriptions.deleteForOwner(owner),
      this.deps.events.deleteForOwner(owner),
    ]);
    return { plusSubscriptions: subscriptions, plusBillingEvents: events };
  }
}
