/**
 * Draft reducer / state machine (spec §2.4, §4A; ADR 0003, ADR 0005).
 *
 * Pure and serializable so the same code runs in the browser for local drafts and on
 * the server for multiplayer rooms. Every accepted event bumps `stateVersion`; an
 * event must carry the version it was built against (optimistic concurrency), and
 * state can always be rebuilt from `createDraft` + the append-only event log via
 * `replay`.
 *
 * Time is modelled with authoritative timestamps (ms since epoch) carried on events;
 * nothing here reads a clock or runs an interval. `resolveTime` answers "has this turn
 * expired at time T, and how much reserve has been used?" deterministically.
 */
import { err, ok, type Result } from "@/common/result";
import {
  getRuleset,
  turnDurationMs,
  type DraftAction,
  type DraftRuleset,
  type DraftTeam,
  type RulesetError,
} from "./rulesets";

export type Side = "radiant" | "dire";
export type DraftMode = "local" | "multiplayer";
export type DraftStatus = "not_started" | "in_progress" | "paused" | "completed";

export interface DraftSelection {
  heroId: number;
  stepIndex: number;
}

/** One resolved step of the sequence. `heroId` is null for a ban skipped by timeout. */
export interface DraftTurnRecord {
  stepIndex: number;
  side: Side;
  action: DraftAction;
  heroId: number | null;
  resolution: "chosen" | "timeout";
}

export interface DraftTimer {
  enabled: boolean;
  /** When the current turn began (shifted forward by pauses). Null when no turn is running. */
  turnStartedAt: number | null;
  /** When the current turn's own time runs out; after this, reserve is consumed. */
  turnDeadline: number | null;
  /** Set while paused; the clock is frozen at this instant. */
  pausedAt: number | null;
  reserveRemainingMs: Record<Side, number>;
}

export interface DraftState {
  rulesetId: string;
  rulesetVersion: number;
  status: DraftStatus;
  /** Index into the ruleset sequence of the turn to play next. */
  stepIndex: number;
  /** The side playing the ruleset's "first" team. */
  firstSide: Side;
  sides: Record<Side, { picks: readonly DraftSelection[]; bans: readonly DraftSelection[] }>;
  turns: readonly DraftTurnRecord[];
  /** Increments on every accepted event. */
  stateVersion: number;
  /** Timestamp of the last accepted event; events may not go back in time. */
  lastEventAt: number | null;
  timer: DraftTimer;
}

interface EventBase {
  /** The `stateVersion` the sender saw. A mismatch is rejected as `stale_version`. */
  expectedVersion: number;
  /** Authoritative timestamp in ms since epoch (server time in multiplayer). */
  at: number;
}

export type DraftEvent =
  | (EventBase & { type: "start" })
  | (EventBase & { type: "pick"; side: Side; heroId: number })
  | (EventBase & { type: "ban"; side: Side; heroId: number })
  | (EventBase & { type: "undo" })
  | (EventBase & { type: "pause" })
  | (EventBase & { type: "resume" })
  /** Resolves an expired turn. `seed` makes the random pick replayable. */
  | (EventBase & { type: "timeout"; seed: number })
  | (EventBase & { type: "reset" });

export interface DraftContext {
  mode: DraftMode;
  /** Hero ids that may be picked or banned (e.g. heroes enabled in Captain's Mode). */
  heroPool: readonly number[];
}

export type DraftError =
  | RulesetError
  | { type: "stale_version"; expected: number; actual: number }
  | { type: "invalid_timestamp"; at: number; lastEventAt: number }
  | { type: "not_started" }
  | { type: "already_started" }
  | { type: "draft_completed" }
  | { type: "draft_paused" }
  | { type: "not_paused" }
  | { type: "wrong_team"; expected: Side; actual: Side }
  | { type: "wrong_action"; expected: DraftAction; actual: DraftAction }
  | { type: "hero_not_in_pool"; heroId: number }
  | { type: "hero_unavailable"; heroId: number }
  | { type: "undo_not_allowed"; mode: DraftMode }
  | { type: "nothing_to_undo" }
  | { type: "timer_disabled" }
  | { type: "turn_expired"; expiredAt: number }
  | { type: "turn_not_expired"; expiresAt: number }
  | { type: "no_heroes_available" };

export interface CreateDraftOptions {
  rulesetId: string;
  rulesetVersion: number;
  firstSide: Side;
  timerEnabled: boolean;
}

export interface DraftTurn {
  stepIndex: number;
  side: Side;
  team: DraftTeam;
  action: DraftAction;
}

export type TimeResolution =
  | { timed: false }
  | {
      timed: true;
      side: Side;
      paused: boolean;
      /** True once turn time and the side's whole reserve are used up. */
      expired: boolean;
      turnRemainingMs: number;
      /** Reserve that this turn has eaten into so far. */
      reserveConsumedMs: number;
      /** The side's reserve left after this turn's consumption. */
      reserveRemainingMs: number;
      /** Instant the turn expires if nothing else happens (pauses push it back). */
      expiresAt: number;
    };

const other = (side: Side): Side => (side === "radiant" ? "dire" : "radiant");
const sideFor = (firstSide: Side, team: DraftTeam): Side =>
  team === "first" ? firstSide : other(firstSide);

export function createDraft(options: CreateDraftOptions): Result<DraftState, DraftError> {
  const ruleset = getRuleset(options.rulesetId, options.rulesetVersion);
  if (!ruleset.ok) return ruleset;
  return ok(initialState(ruleset.value, options.firstSide, options.timerEnabled, 0, null));
}

function initialState(
  ruleset: DraftRuleset,
  firstSide: Side,
  timerEnabled: boolean,
  stateVersion: number,
  lastEventAt: number | null,
): DraftState {
  const reserveMs = ruleset.timing.reservePerTeamSec * 1000;
  return {
    rulesetId: ruleset.id,
    rulesetVersion: ruleset.version,
    status: "not_started",
    stepIndex: 0,
    firstSide,
    sides: { radiant: { picks: [], bans: [] }, dire: { picks: [], bans: [] } },
    turns: [],
    stateVersion,
    lastEventAt,
    timer: {
      enabled: timerEnabled,
      turnStartedAt: null,
      turnDeadline: null,
      pausedAt: null,
      reserveRemainingMs: { radiant: reserveMs, dire: reserveMs },
    },
  };
}

function turnFor(state: DraftState, ruleset: DraftRuleset): DraftTurn | null {
  if (state.status !== "in_progress" && state.status !== "paused") return null;
  const step = ruleset.sequence[state.stepIndex];
  if (!step) return null;
  return {
    stepIndex: state.stepIndex,
    side: sideFor(state.firstSide, step.team),
    team: step.team,
    action: step.action,
  };
}

/** The turn to play next, or null when the draft is not running or is complete. */
export function currentTurn(state: DraftState): DraftTurn | null {
  const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
  return ruleset.ok ? turnFor(state, ruleset.value) : null;
}

export function isComplete(state: DraftState): boolean {
  return state.status === "completed";
}

function usedHeroIds(state: DraftState): Set<number> {
  const used = new Set<number>();
  for (const side of [state.sides.radiant, state.sides.dire]) {
    for (const s of side.picks) used.add(s.heroId);
    for (const s of side.bans) used.add(s.heroId);
  }
  return used;
}

/** Heroes from `allHeroIds` not yet picked or banned, deduplicated and sorted ascending. */
export function availableHeroes(state: DraftState, allHeroIds: readonly number[]): number[] {
  const used = usedHeroIds(state);
  return [...new Set(allHeroIds)].filter((id) => !used.has(id)).sort((a, b) => a - b);
}

function timeAt(state: DraftState, ruleset: DraftRuleset, now: number): TimeResolution {
  const turn = turnFor(state, ruleset);
  const { enabled, turnDeadline, pausedAt, reserveRemainingMs } = state.timer;
  if (!enabled || !turn || turnDeadline === null) return { timed: false };
  const paused = state.status === "paused" && pausedAt !== null;
  // A paused clock is frozen at the pause instant.
  const effectiveNow = paused ? pausedAt : now;
  const reserve = reserveRemainingMs[turn.side];
  const overflow = Math.max(0, effectiveNow - turnDeadline);
  const reserveConsumedMs = Math.min(overflow, reserve);
  const expiresAt = turnDeadline + reserve;
  return {
    timed: true,
    side: turn.side,
    paused,
    expired: effectiveNow >= expiresAt,
    turnRemainingMs: Math.max(0, turnDeadline - effectiveNow),
    reserveConsumedMs,
    reserveRemainingMs: reserve - reserveConsumedMs,
    expiresAt,
  };
}

/**
 * Where the current turn's clock stands at `now`. Turn time is spent first, then the
 * acting side's reserve; the turn expires when both are gone. Paused drafts are
 * evaluated at the pause instant, so they never consume time.
 */
export function resolveTime(state: DraftState, now: number): TimeResolution {
  const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
  return ruleset.ok ? timeAt(state, ruleset.value, now) : { timed: false };
}

/** mulberry32: tiny deterministic PRNG so timeout picks replay identically. */
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Deterministic choice from `candidates` (expected sorted) for a given seed. */
export function seededChoice(candidates: readonly number[], seed: number): number | null {
  if (candidates.length === 0) return null;
  return candidates[Math.floor(seededUnit(seed) * candidates.length)];
}

function statusGuard(state: DraftState): DraftError | null {
  switch (state.status) {
    case "not_started":
      return { type: "not_started" };
    case "completed":
      return { type: "draft_completed" };
    case "paused":
      return { type: "draft_paused" };
    case "in_progress":
      return null;
  }
}

/** Start the turn at `stepIndex` at time `at`, or complete the draft. */
function beginTurn(
  state: DraftState,
  ruleset: DraftRuleset,
  stepIndex: number,
  at: number,
): DraftState {
  if (stepIndex >= ruleset.sequence.length) {
    return {
      ...state,
      stepIndex,
      status: "completed",
      timer: { ...state.timer, turnStartedAt: null, turnDeadline: null, pausedAt: null },
    };
  }
  const timed = state.timer.enabled;
  return {
    ...state,
    stepIndex,
    status: "in_progress",
    timer: {
      ...state.timer,
      turnStartedAt: timed ? at : null,
      turnDeadline: timed ? at + turnDurationMs(ruleset, stepIndex) : null,
      pausedAt: null,
    },
  };
}

function recordTurn(state: DraftState, record: DraftTurnRecord): DraftState {
  if (record.heroId === null) return { ...state, turns: [...state.turns, record] };
  const selection: DraftSelection = { heroId: record.heroId, stepIndex: record.stepIndex };
  const side = state.sides[record.side];
  const updated =
    record.action === "pick"
      ? { ...side, picks: [...side.picks, selection] }
      : { ...side, bans: [...side.bans, selection] };
  return {
    ...state,
    turns: [...state.turns, record],
    sides: { ...state.sides, [record.side]: updated },
  };
}

function spendReserve(state: DraftState, side: Side, reserveLeftMs: number): DraftState {
  return {
    ...state,
    timer: {
      ...state.timer,
      reserveRemainingMs: { ...state.timer.reserveRemainingMs, [side]: reserveLeftMs },
    },
  };
}

function applyChoice(
  state: DraftState,
  ruleset: DraftRuleset,
  event: Extract<DraftEvent, { type: "pick" | "ban" }>,
  ctx: DraftContext,
): Result<DraftState, DraftError> {
  const blocked = statusGuard(state);
  if (blocked) return err(blocked);
  const turn = turnFor(state, ruleset);
  if (!turn) return err({ type: "draft_completed" });
  if (event.side !== turn.side) {
    return err({ type: "wrong_team", expected: turn.side, actual: event.side });
  }
  if (event.type !== turn.action) {
    return err({ type: "wrong_action", expected: turn.action, actual: event.type });
  }
  if (!ctx.heroPool.includes(event.heroId)) {
    return err({ type: "hero_not_in_pool", heroId: event.heroId });
  }
  if (usedHeroIds(state).has(event.heroId)) {
    return err({ type: "hero_unavailable", heroId: event.heroId });
  }
  let next = state;
  const time = timeAt(state, ruleset, event.at);
  if (time.timed) {
    if (time.expired) return err({ type: "turn_expired", expiredAt: time.expiresAt });
    next = spendReserve(next, turn.side, time.reserveRemainingMs);
  }
  next = recordTurn(next, {
    stepIndex: turn.stepIndex,
    side: turn.side,
    action: turn.action,
    heroId: event.heroId,
    resolution: "chosen",
  });
  return ok(beginTurn(next, ruleset, turn.stepIndex + 1, event.at));
}

/**
 * Timeout rule (matches the live game): an expired ban bans nothing; an expired pick
 * takes a seeded "random" hero from the sorted available pool. The next turn starts at
 * the instant the turn expired, not when the timeout was observed, so lazily resolving
 * expiry later gives the same result.
 */
function applyTimeout(
  state: DraftState,
  ruleset: DraftRuleset,
  event: Extract<DraftEvent, { type: "timeout" }>,
  ctx: DraftContext,
): Result<DraftState, DraftError> {
  const blocked = statusGuard(state);
  if (blocked) return err(blocked);
  const turn = turnFor(state, ruleset);
  if (!turn) return err({ type: "draft_completed" });
  const time = timeAt(state, ruleset, event.at);
  if (!time.timed) return err({ type: "timer_disabled" });
  if (!time.expired) return err({ type: "turn_not_expired", expiresAt: time.expiresAt });

  let heroId: number | null = null;
  if (turn.action === "pick") {
    heroId = seededChoice(availableHeroes(state, ctx.heroPool), event.seed);
    if (heroId === null) return err({ type: "no_heroes_available" });
  }
  let next = spendReserve(state, turn.side, 0);
  next = recordTurn(next, {
    stepIndex: turn.stepIndex,
    side: turn.side,
    action: turn.action,
    heroId,
    resolution: "timeout",
  });
  return ok(beginTurn(next, ruleset, turn.stepIndex + 1, time.expiresAt));
}

/**
 * Local-only undo: reverts the last resolved step and restarts that turn's clock at the
 * undo instant. Reserve already spent is not refunded.
 */
function applyUndo(
  state: DraftState,
  ruleset: DraftRuleset,
  event: Extract<DraftEvent, { type: "undo" }>,
  ctx: DraftContext,
): Result<DraftState, DraftError> {
  if (ctx.mode !== "local") return err({ type: "undo_not_allowed", mode: ctx.mode });
  if (state.status === "not_started") return err({ type: "not_started" });
  if (state.status === "paused") return err({ type: "draft_paused" });
  const last = state.turns.at(-1);
  if (!last) return err({ type: "nothing_to_undo" });
  const side = state.sides[last.side];
  const without = (list: readonly DraftSelection[]): DraftSelection[] =>
    list.filter((s) => s.stepIndex !== last.stepIndex);
  const next: DraftState = {
    ...state,
    turns: state.turns.slice(0, -1),
    sides: {
      ...state.sides,
      [last.side]: { picks: without(side.picks), bans: without(side.bans) },
    },
  };
  return ok(beginTurn(next, ruleset, last.stepIndex, event.at));
}

function transition(
  state: DraftState,
  ruleset: DraftRuleset,
  event: DraftEvent,
  ctx: DraftContext,
): Result<DraftState, DraftError> {
  switch (event.type) {
    case "start":
      if (state.status !== "not_started") return err({ type: "already_started" });
      return ok(beginTurn(state, ruleset, 0, event.at));
    case "pick":
    case "ban":
      return applyChoice(state, ruleset, event, ctx);
    case "timeout":
      return applyTimeout(state, ruleset, event, ctx);
    case "undo":
      return applyUndo(state, ruleset, event, ctx);
    case "pause": {
      const blocked = statusGuard(state);
      if (blocked) return err(blocked);
      const time = timeAt(state, ruleset, event.at);
      if (time.timed && time.expired) {
        return err({ type: "turn_expired", expiredAt: time.expiresAt });
      }
      return ok({ ...state, status: "paused", timer: { ...state.timer, pausedAt: event.at } });
    }
    case "resume": {
      if (state.status !== "paused") return err({ type: "not_paused" });
      const { pausedAt, turnStartedAt, turnDeadline } = state.timer;
      const shift = pausedAt === null ? 0 : event.at - pausedAt;
      return ok({
        ...state,
        status: "in_progress",
        timer: {
          ...state.timer,
          pausedAt: null,
          turnStartedAt: turnStartedAt === null ? null : turnStartedAt + shift,
          turnDeadline: turnDeadline === null ? null : turnDeadline + shift,
        },
      });
    }
    case "reset":
      return ok(
        initialState(ruleset, state.firstSide, state.timer.enabled, state.stateVersion, null),
      );
  }
}

/**
 * Apply one event. Pure: returns a new state or a typed error and never mutates input.
 * Checks, in order: ruleset exists, `expectedVersion` matches, timestamp is not earlier
 * than the last accepted event, then the event's own legality.
 */
export function applyEvent(
  state: DraftState,
  event: DraftEvent,
  ctx: DraftContext,
): Result<DraftState, DraftError> {
  const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
  if (!ruleset.ok) return ruleset;
  if (event.expectedVersion !== state.stateVersion) {
    return err({
      type: "stale_version",
      expected: event.expectedVersion,
      actual: state.stateVersion,
    });
  }
  if (state.lastEventAt !== null && event.at < state.lastEventAt) {
    return err({ type: "invalid_timestamp", at: event.at, lastEventAt: state.lastEventAt });
  }
  const next = transition(state, ruleset.value, event, ctx);
  if (!next.ok) return next;
  return ok({ ...next.value, stateVersion: state.stateVersion + 1, lastEventAt: event.at });
}

export interface ReplayError {
  /** Index in the event log of the first event that failed. */
  index: number;
  error: DraftError;
}

/** Rebuild state from a snapshot (or `createDraft` output) plus an ordered event log. */
export function replay(
  initial: DraftState,
  events: readonly DraftEvent[],
  ctx: DraftContext,
): Result<DraftState, ReplayError> {
  let state = initial;
  for (const [index, event] of events.entries()) {
    const next = applyEvent(state, event, ctx);
    if (!next.ok) return err({ index, error: next.error });
    state = next.value;
  }
  return ok(state);
}
