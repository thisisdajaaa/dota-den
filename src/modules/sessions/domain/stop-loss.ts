/**
 * Stop-loss (pure, free for everyone): limits a player sets for themselves, checked against
 * the current play session. Additive to the automatic tilt check: nothing here guesses how
 * they'll play; it only counts their own imported games against the numbers they chose.
 *
 * Games of every type count, as the session record on the dashboard and Sessions page does.
 */
import type { SessionMatch } from "./session";

/** In the order a reminder names them when several are reached by the same game. */
export const STOP_LOSS_RULES = ["losses", "streak", "games"] as const;
export type StopLossRule = (typeof STOP_LOSS_RULES)[number];

/**
 * - `losses`: losses in the session.
 * - `streak`: losses in a row at the end of the session.
 * - `games`: games in the session.
 */
export const STOP_LOSS_RANGES: Record<StopLossRule, { min: number; max: number }> = {
  losses: { min: 1, max: 10 },
  streak: { min: 2, max: 10 },
  games: { min: 1, max: 20 },
};

/** The quick picks in settings; any value in the range can be typed instead. */
export const STOP_LOSS_PRESETS: Record<StopLossRule, readonly number[]> = {
  losses: [2, 3, 4],
  streak: [2, 3],
  games: [3, 5, 8],
};

export type StopLossLimits = Record<StopLossRule, number | null>;

export interface StopLossSettings {
  enabled: boolean;
  /** Null: that rule is off. */
  limits: StopLossLimits;
}

/** Nobody has a stop-loss until they set one (no migration: a missing setting is this). */
export const STOP_LOSS_OFF: StopLossSettings = {
  enabled: false,
  limits: { losses: null, streak: null, games: null },
};

export function isStopLossLimit(rule: StopLossRule, v: unknown): v is number {
  const { min, max } = STOP_LOSS_RANGES[rule];
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** A stored value read back safely: anything out of range turns that rule off. */
export function normalizeStopLoss(raw: unknown): StopLossSettings {
  if (!raw || typeof raw !== "object") return STOP_LOSS_OFF;
  const r = raw as { enabled?: unknown; limits?: Record<string, unknown> };
  const limits = { ...STOP_LOSS_OFF.limits };
  for (const rule of STOP_LOSS_RULES) {
    const v = r.limits?.[rule];
    limits[rule] = isStopLossLimit(rule, v) ? v : null;
  }
  return { enabled: r.enabled === true, limits };
}

/** On, with at least one rule set. */
export function isStopLossActive(s: StopLossSettings): boolean {
  return s.enabled && STOP_LOSS_RULES.some((rule) => s.limits[rule] !== null);
}

export interface StopLossRuleStatus {
  rule: StopLossRule;
  limit: number;
  used: number;
  reached: boolean;
}

export interface StopLossStatus {
  /** Only the rules that are set, in `STOP_LOSS_RULES` order. */
  rules: StopLossRuleStatus[];
  /** The rules at or past their limit. */
  reached: StopLossRule[];
}

/** Losses in a row at the end of these games (oldest first). */
export function trailingLosses(matches: readonly Pick<SessionMatch, "result">[]): number {
  let n = 0;
  for (let i = matches.length - 1; i >= 0 && matches[i].result === "loss"; i--) n++;
  return n;
}

/**
 * Where a session stands against the player's limits. `matches` are the session's games up
 * to the moment being checked, oldest first. Null when the stop-loss is off.
 */
export function evaluateStopLoss(
  settings: StopLossSettings,
  matches: readonly Pick<SessionMatch, "result">[],
): StopLossStatus | null {
  if (!isStopLossActive(settings)) return null;
  const used: Record<StopLossRule, number> = {
    losses: matches.filter((m) => m.result === "loss").length,
    streak: trailingLosses(matches),
    games: matches.length,
  };
  const rules: StopLossRuleStatus[] = [];
  for (const rule of STOP_LOSS_RULES) {
    const limit = settings.limits[rule];
    if (limit === null) continue;
    rules.push({ rule, limit, used: used[rule], reached: used[rule] >= limit });
  }
  return { rules, reached: rules.filter((r) => r.reached).map((r) => r.rule) };
}

/** The dedupe key for one rule in one session: each is reminded at most once. */
export const stopLossKey = (sessionId: string, rule: StopLossRule) => `${sessionId}:${rule}`;

/**
 * Which reached rules still need a reminder, given the ones already sent this session, and
 * the one to name in it (the first in `STOP_LOSS_RULES` order). Null: nothing new to say.
 */
export function stopLossReminder(
  status: StopLossStatus | null,
  alreadySent: ReadonlySet<StopLossRule>,
): { rule: StopLossRuleStatus; fresh: StopLossRule[] } | null {
  if (!status) return null;
  const fresh = status.reached.filter((r) => !alreadySent.has(r));
  if (fresh.length === 0) return null;
  const rule = status.rules.find((r) => r.rule === fresh[0])!;
  return { rule, fresh };
}
