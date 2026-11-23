/**
 * The free Plus trial (pure). Seven days of Plus, started by the player, with no card and no
 * payment provider involved: nothing is ever charged and nothing renews. One per Steam account,
 * ever, and only for players who have never had a subscription (ADR 0013, "Free trial").
 */
import type { Entitlement } from "./entitlement";

export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * 24 * 3_600_000;

export interface FreeTrial {
  userId: string;
  accountId32: number;
  startedAt: Date;
  endsAt: Date;
}

/** A new trial starting at `now`. */
export function newTrial(userId: string, accountId32: number, now: Date): FreeTrial {
  return { userId, accountId32, startedAt: now, endsAt: new Date(now.getTime() + TRIAL_MS) };
}

/** Plus from the trial at `now`, or null once it has ended (or there is none). */
export function trialEntitlement(trial: FreeTrial | null, now: Date): Entitlement | null {
  if (!trial || now.getTime() >= trial.endsAt.getTime()) return null;
  return { plus: true, reason: "free_trial", until: trial.endsAt };
}

/**
 * What the Plus page offers about the trial:
 * - `available`: can start one (on sale, never trialled, never subscribed, no Plus now);
 * - `active`: running until `endsAt`;
 * - `used`: this account had one;
 * - `none`: not offered (not on sale, already has Plus some other way, or subscribed before).
 */
export type TrialStatus = "available" | "active" | "used" | "none";

export function trialStatus(input: {
  trial: FreeTrial | null;
  now: Date;
  onSale: boolean;
  /** Plus from a subscription or staff (the trial doesn't count here). */
  otherPlus: boolean;
  /** Any subscription of this player's, in any state. */
  everSubscribed: boolean;
}): TrialStatus {
  const { trial, now } = input;
  if (trial) return trialEntitlement(trial, now) && !input.otherPlus ? "active" : "used";
  if (!input.onSale || input.otherPlus || input.everSubscribed) return "none";
  return "available";
}
