/**
 * Dota Den Plus: what it costs and what it adds (pure). Everything that is free stays free;
 * Plus only adds (ADR 0013).
 */

export const PLANS = ["monthly", "yearly"] as const;
export type Plan = (typeof PLANS)[number];

export const isPlan = (v: unknown): v is Plan =>
  typeof v === "string" && (PLANS as readonly string[]).includes(v);

/**
 * Display prices in Philippine pesos, the store's currency (keep in step with the Lemon
 * Squeezy variants). The checkout may show them in the buyer's local currency (with tax), so
 * these are the reference prices only.
 */
export const PLAN_PRICES: Record<Plan, { amount: string; currency: "PHP" }> = {
  monthly: { amount: "₱299", currency: "PHP" },
  yearly: { amount: "₱2,990", currency: "PHP" },
};

/** Where a cap already exists for free players, Plus multiplies it by this. */
export const PLUS_LIMIT_MULTIPLIER = 2;

/** A free player's cap, or the Plus one. Never lower than the free cap. */
export function limitFor(base: number, plus: boolean): number {
  return plus ? base * PLUS_LIMIT_MULTIPLIER : base;
}

/**
 * The AI draft review has no per-player quota today (only a per-minute rate limit against
 * abuse). Free keeps exactly that; Plus is "unlimited" so a future free quota can never apply
 * to supporters. Nothing reads a number from here until such a quota exists.
 */
export type AiReviewAllowance = "standard" | "unlimited";

export function aiReviewAllowance(plus: boolean): AiReviewAllowance {
  return plus ? "unlimited" : "standard";
}

/** Valid ids from our own users collection (MongoDB ObjectIds, 24 hex characters). */
export const USER_ID_PATTERN = /^[a-f0-9]{24}$/;
