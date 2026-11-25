import { ConflictError, NotFoundError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import {
  claimRefusal,
  grantId,
  newReferralCode,
  nextGrantStart,
  normalizeReferralCode,
  REFERRAL_MAX_REWARDS,
  REFERRAL_MS,
  settleAction,
  type ClaimRefusal,
  type Referral,
} from "../domain/referral";
import type { GrantsPort, ReferralsPort } from "../plus.ports";
import type { InviteDto, ReferralClaimDto } from "../dtos/responses/plus.dto";
import type { PlusService } from "./plus.service";

/** Attempts at a fresh code before giving up (31^8 codes: a clash is already rare). */
const CODE_ATTEMPTS = 5;

/**
 * Invite a friend: both get a week of Plus once the friend, new to Dota Den, shows real games.
 * Weeks are granted inside the app (no provider, nothing charged), only while Plus is on sale.
 */
export class ReferralService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      referrals: ReferralsPort;
      grants: GrantsPort;
      plus: Pick<PlusService, "offer" | "enabled" | "everSubscribed" | "freePeriods">;
      users: {
        byId(userId: string): Promise<{ id: string; accountId32: number; createdAt: Date } | null>;
      };
      /** Imported games per Dota account (from matches). */
      matchCounts(accountIds: readonly number[]): Promise<Map<number, number>>;
      randomInt(n: number): number;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get available(): boolean {
    return this.deps.plus.enabled && this.deps.plus.offer().status === "available";
  }

  /** The player's invite: their code (made on first visit), and how their friends are doing. */
  async invite(user: { id: string; accountId32: number }): Promise<InviteDto> {
    if (!this.available)
      return {
        available: false,
        code: null,
        joined: 0,
        waiting: 0,
        earned: 0,
        max: REFERRAL_MAX_REWARDS,
        mine: null,
      };
    await this.settleFor(user.id, user.accountId32);
    const [code, claims, mine] = await Promise.all([
      this.codeFor(user),
      this.deps.referrals.byReferrer(user.id),
      this.deps.referrals.claimOf(user.accountId32, user.id),
    ]);
    return {
      available: true,
      code,
      joined: claims.filter((c) => c.status === "rewarded").length,
      waiting: claims.filter((c) => c.status === "pending").length,
      earned: claims.filter((c) => c.status === "rewarded" && c.referrerRewarded).length,
      max: REFERRAL_MAX_REWARDS,
      mine: mine ? mine.status : null,
    };
  }

  private async codeFor(user: { id: string; accountId32: number }): Promise<string> {
    const existing = await this.deps.referrals.codeOf(user.id);
    if (existing) return existing;
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = newReferralCode(this.deps.randomInt);
      if (
        await this.deps.referrals.saveCode({
          code,
          userId: user.id,
          accountId32: user.accountId32,
          createdAt: this.now(),
        })
      )
        return code;
      // Taken, or another request made this player's code meanwhile.
      const made = await this.deps.referrals.codeOf(user.id);
      if (made) return made;
    }
    throw new ConflictError("Couldn't make an invite link. Try again.");
  }

  /** Who a code from a link belongs to (the landing page), or null. */
  async codeOwner(raw: unknown): Promise<string | null> {
    const code = normalizeReferralCode(raw);
    return code ? ((await this.deps.referrals.ownerOf(code))?.userId ?? null) : null;
  }

  /**
   * The signed-in friend claims an invite. Rewards both right away when their games are already
   * imported; otherwise the claim waits for them (settled when either player opens the page).
   */
  async claim(friendUserId: string, raw: unknown): Promise<ReferralClaimDto> {
    const refuse = (reason: ClaimRefusal, message: string): never => {
      throw reason === "unknown_code" || reason === "unavailable"
        ? new NotFoundError(message, { reason })
        : new ConflictError(message, { reason });
    };
    if (!this.available) refuse("unavailable", "Invites aren't available right now.");
    const code = normalizeReferralCode(raw);
    const referrer = code ? await this.deps.referrals.ownerOf(code) : null;
    if (!code || !referrer) return refuse("unknown_code", "That invite link doesn't exist.");
    const friend = await this.deps.users.byId(friendUserId);
    if (!friend) return refuse("unknown_code", "That invite link doesn't exist.");
    const now = this.now();
    const [previous, everSubscribed] = await Promise.all([
      this.deps.referrals.claimOf(friend.accountId32, friend.id),
      this.deps.plus.everSubscribed(friend.id),
    ]);
    // Claiming the same invite again re-checks a waiting claim.
    if (previous && previous.referrerId === referrer.userId) {
      const status = await this.settle(previous);
      return { status: status === "pending" ? "waiting" : status };
    }
    const refusal = claimRefusal({
      referrer,
      friend: { userId: friend.id, accountId32: friend.accountId32, createdAt: friend.createdAt },
      now,
      alreadyReferred: previous !== null,
      everSubscribed,
    });
    if (refusal) refuse(refusal, MESSAGES[refusal]);
    const referral: Referral = {
      friendAccountId32: friend.accountId32,
      friendUserId: friend.id,
      referrerId: referrer.userId,
      referrerAccountId32: referrer.accountId32,
      code,
      claimedAt: now,
      status: "pending",
      rewardedAt: null,
      referrerRewarded: false,
    };
    if (!(await this.deps.referrals.claim(referral)))
      refuse("already_referred", MESSAGES.already_referred);
    const status = await this.settle(referral);
    return { status: status === "pending" ? "waiting" : status };
  }

  /**
   * The friend's side, after their games import (the dashboard calls it): rewards their waiting
   * claim, which gives the inviter's week too. One read when there's nothing to do. Never throws.
   */
  async settleOwn(user: { id: string; accountId32: number }): Promise<void> {
    if (!this.available) return;
    try {
      const own = await this.deps.referrals.claimOf(user.accountId32, user.id);
      if (own?.status === "pending") await this.settle(own);
    } catch (error) {
      this.deps.logger.warn("plus_referral_settle_failed", { error });
    }
  }

  /** Settles this player's waiting claims, as inviter and as friend. Never throws. */
  private async settleFor(userId: string, accountId32: number) {
    try {
      const [sent, own] = await Promise.all([
        this.deps.referrals.byReferrer(userId),
        this.deps.referrals.claimOf(accountId32, userId),
      ]);
      for (const r of [...sent, ...(own ? [own] : [])])
        if (r.status === "pending") await this.settle(r);
    } catch (error) {
      this.deps.logger.warn("plus_referral_settle_failed", { error });
    }
  }

  /** Rewards a waiting claim whose friend now has enough games (or lets an old one lapse). */
  private async settle(r: Referral): Promise<Referral["status"]> {
    const now = this.now();
    const counts = await this.deps.matchCounts([r.friendAccountId32]);
    const action = settleAction(r, counts.get(r.friendAccountId32) ?? 0, now);
    if (action === "wait" || action === "none") return r.status;
    if (action === "expire") {
      await this.deps.referrals.settle(r.friendAccountId32, {
        status: "expired",
        rewardedAt: null,
        referrerRewarded: false,
      });
      return "expired";
    }
    const earned = (await this.deps.referrals.byReferrer(r.referrerId)).filter(
      (c) => c.status === "rewarded" && c.referrerRewarded,
    ).length;
    const referrerRewarded = earned < REFERRAL_MAX_REWARDS;
    // Grants first: they're keyed by the claim, so a retry after a failure gives each once.
    await this.give(r.friendUserId, r.friendAccountId32, grantId(r.friendAccountId32, "friend"));
    if (referrerRewarded)
      await this.give(
        r.referrerId,
        r.referrerAccountId32,
        grantId(r.friendAccountId32, "referrer"),
      );
    await this.deps.referrals.settle(r.friendAccountId32, {
      status: "rewarded",
      rewardedAt: now,
      referrerRewarded,
    });
    return "rewarded";
  }

  /** A week of Plus, starting when any free Plus already running ends. */
  private async give(userId: string, accountId32: number, id: string) {
    const now = this.now();
    const startsAt = nextGrantStart(await this.deps.plus.freePeriods(userId), now);
    await this.deps.grants.give({
      id,
      userId,
      accountId32,
      source: "referral",
      startsAt,
      endsAt: new Date(startsAt.getTime() + REFERRAL_MS),
      createdAt: now,
    });
  }
}

const MESSAGES: Record<ClaimRefusal, string> = {
  unavailable: "Invites aren't available right now.",
  unknown_code: "That invite link doesn't exist.",
  own_code: "That's your own invite link. Send it to a friend.",
  not_new: "Invite links are for players new to Dota Den.",
  already_referred: "This Steam account has already used an invite link.",
  had_plus: "Invite links are for players who haven't had Plus yet.",
};
