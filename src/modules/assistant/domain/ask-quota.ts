import { addDays, dayKeyFormatter, type DayKey } from "@/common/time/day-key";

/**
 * Ask Den's daily question allowance (pure). Days are Manila days: most players are in the
 * Philippines, so "5 a day" resets at their midnight, not at UTC's (8 am there).
 */

export const ASK_TIME_ZONE = "Asia/Manila";
/** The Philippines has kept UTC+8 all year since 1978 (no daylight saving). */
const MANILA_OFFSET = "+08:00";

export const ASK_FREE_PER_DAY = 5;
export const ASK_PLUS_PER_DAY = 100;

const manilaDay = dayKeyFormatter(ASK_TIME_ZONE);

/** The Manila calendar day a question counts on ("YYYY-MM-DD"). */
export function askDay(now: Date): DayKey {
  return manilaDay(now);
}

/** The next Manila midnight after `now`: when today's count starts over. */
export function nextReset(now: Date): Date {
  return new Date(`${addDays(askDay(now), 1)}T00:00:00${MANILA_OFFSET}`);
}

export interface AskLimits {
  free: number;
  plus: number;
}

export interface AskQuota {
  plus: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** ISO time of the next reset (Manila midnight). */
  resetsAt: string;
}

export function dailyLimit(plus: boolean, limits: AskLimits): number {
  return plus ? limits.plus : limits.free;
}

export function askQuota(input: {
  plus: boolean;
  used: number;
  now: Date;
  limits: AskLimits;
}): AskQuota {
  const limit = dailyLimit(input.plus, input.limits);
  const used = Math.max(0, input.used);
  return {
    plus: input.plus,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: nextReset(input.now).toISOString(),
  };
}
