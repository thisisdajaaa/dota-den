/**
 * Invite a friend (pure): a player shares their link; a friend who is new to Dota Den signs in
 * with Steam and claims it; once the friend's account shows real games, both get a week of Plus.
 * Like the free trial, the weeks are granted inside the app: no card, no coupon, nothing charged
 * and nothing renews (ADR 0013, "Referrals").
 */
import type { Entitlement } from "./entitlement";

export const REFERRAL_DAYS = 7;
const DAY_MS = 24 * 3_600_000;
export const REFERRAL_MS = REFERRAL_DAYS * DAY_MS;
/** Weeks one player can earn by inviting, ever (the friends always get theirs). */
export const REFERRAL_MAX_REWARDS = 5;
/** Imported games the friend's account needs before the weeks are given (a real player). */
export const REFERRAL_MIN_MATCHES = 10;
/** A link can be claimed only this soon after the friend's first sign-in. */
export const REFERRAL_CLAIM_WINDOW_MS = 7 * DAY_MS;
/** A claim whose games never show up lapses after this long. */
export const REFERRAL_PENDING_MS = 30 * DAY_MS;

/** No 0/o, 1/l/i: read aloud or typed from a screenshot without mistakes. */
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

/** A new code from `randomInt(n)` (0 ≤ result < n; crypto-backed in the app). */
export function newReferralCode(randomInt: (n: number) => number): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Codes are shown lowercase; people may type them in capitals or with spaces. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export type ReferralStatus = "pending" | "rewarded" | "expired";

/** One friend's claim. Keyed by the friend's Steam account: each account is referred once, ever. */
export interface Referral {
  friendAccountId32: number;
  friendUserId: string;
  referrerId: string;
  referrerAccountId32: number;
  code: string;
  claimedAt: Date;
  status: ReferralStatus;
  rewardedAt: Date | null;
  /** False when the inviter had already earned REFERRAL_MAX_REWARDS weeks. */
  referrerRewarded: boolean;
}

export type ClaimRefusal =
  /** Referrals aren't offered right now (Plus not on sale). */
  | "unavailable"
  | "unknown_code"
  | "own_code"
  /** The friend's Dota Den account is older than the claim window. */
  | "not_new"
  /** This Steam account was referred before. */
  | "already_referred"
  /** The friend has (or had) a subscription: referrals are for new players. */
  | "had_plus";

export function claimRefusal(input: {
  referrer: { userId: string; accountId32: number };
  friend: { userId: string; accountId32: number; createdAt: Date };
  now: Date;
  alreadyReferred: boolean;
  everSubscribed: boolean;
}): ClaimRefusal | null {
  const { referrer, friend } = input;
  if (referrer.userId === friend.userId || referrer.accountId32 === friend.accountId32)
    return "own_code";
  if (input.alreadyReferred) return "already_referred";
  if (input.now.getTime() - friend.createdAt.getTime() > REFERRAL_CLAIM_WINDOW_MS) return "not_new";
  if (input.everSubscribed) return "had_plus";
  return null;
}

/** What to do with a pending claim now. */
export function settleAction(
  referral: Pick<Referral, "status" | "claimedAt">,
  friendMatches: number,
  now: Date,
): "reward" | "wait" | "expire" | "none" {
  if (referral.status !== "pending") return "none";
  if (now.getTime() - referral.claimedAt.getTime() >= REFERRAL_PENDING_MS) return "expire";
  return friendMatches >= REFERRAL_MIN_MATCHES ? "reward" : "wait";
}

/** A week of Plus given inside the app (no provider). */
export interface PlusGrant {
  /** `referral:<friendAccountId32>:<friend|referrer>`: granting twice is a no-op. */
  id: string;
  userId: string;
  accountId32: number;
  source: "referral";
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
}

export const grantId = (friendAccountId32: number, side: "friend" | "referrer") =>
  `referral:${friendAccountId32}:${side}`;

/** A stretch of free Plus: the trial or a granted week. */
export interface FreePeriod {
  reason: "free_trial" | "referral";
  startsAt: Date;
  endsAt: Date;
}

/** Periods touching or overlapping one another, from the one covering `now`. */
function chainFrom(periods: readonly FreePeriod[], now: Date) {
  const t = now.getTime();
  const sorted = [...periods].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const covering = sorted.filter((p) => p.startsAt.getTime() <= t && t < p.endsAt.getTime());
  if (covering.length === 0) return null;
  // The covering period that ends last decides the reason shown.
  const current = covering.reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
  let end = current.endsAt.getTime();
  for (const p of sorted)
    if (p.startsAt.getTime() <= end && p.endsAt.getTime() > end) end = p.endsAt.getTime();
  return { current, end: new Date(end) };
}

/**
 * Free Plus at `now` from the trial and granted weeks, or null. `until` is the end of the whole
 * run (a week earned during the trial starts when it ends).
 */
export function freePlus(periods: readonly FreePeriod[], now: Date): Entitlement | null {
  const chain = chainFrom(periods, now);
  return chain ? { plus: true, reason: chain.current.reason, until: chain.end } : null;
}

/** When a new week starts: right away, or when the free Plus already running ends. */
export function nextGrantStart(periods: readonly FreePeriod[], now: Date): Date {
  return chainFrom(periods, now)?.end ?? now;
}
