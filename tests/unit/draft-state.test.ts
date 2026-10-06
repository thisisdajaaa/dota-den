import { describe, expect, it } from "vitest";
import {
  applyEvent,
  availableHeroes,
  createDraft,
  currentTurn,
  isComplete,
  replay,
  resolveTime,
  type CreateDraftOptions,
  type DraftContext,
  type DraftError,
  type DraftEvent,
  type DraftState,
} from "@/modules/drafts/domain/draft-state";
import { getRuleset } from "@/modules/drafts/domain/rulesets";
import type { Result } from "@/common/result";

const POOL = Array.from({ length: 130 }, (_, i) => i + 1);
const LOCAL: DraftContext = { mode: "local", heroPool: POOL };
const MULTI: DraftContext = { mode: "multiplayer", heroPool: POOL };
const T0 = 1_790_000_000_000;
const SEC = 1000;

type Command = DraftEvent extends infer E
  ? E extends DraftEvent
    ? Omit<E, "expectedVersion">
    : never
  : never;

function value<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}

function errorOf(r: Result<unknown, DraftError>): DraftError {
  if (r.ok) throw new Error("expected an error");
  return r.error;
}

function create(overrides: Partial<CreateDraftOptions> = {}): DraftState {
  return value(
    createDraft({
      rulesetId: "cm-2026",
      rulesetVersion: 1,
      firstSide: "radiant",
      timerEnabled: false,
      ...overrides,
    }),
  );
}

/** Build an event against the state's current version. */
const ev = (state: DraftState, cmd: Command): DraftEvent =>
  ({ ...cmd, expectedVersion: state.stateVersion }) as DraftEvent;

function send(
  state: DraftState,
  cmd: Command,
  ctx: DraftContext = LOCAL,
): Result<DraftState, DraftError> {
  return applyEvent(state, ev(state, cmd), ctx);
}

/** Legal move for the current turn using the lowest available hero. */
function nextMove(state: DraftState, at: number): Command {
  const turn = currentTurn(state);
  if (!turn) throw new Error("no turn");
  const heroId = availableHeroes(state, POOL)[0];
  return { type: turn.action, side: turn.side, heroId, at };
}

/** Plays a whole draft, returning the final state and the event log. */
function playAll(
  initial: DraftState,
  ctx: DraftContext = LOCAL,
): { state: DraftState; log: DraftEvent[] } {
  const log: DraftEvent[] = [];
  let state = initial;
  const step = (cmd: Command): void => {
    const e = ev(state, cmd);
    state = value(applyEvent(state, e, ctx));
    log.push(e);
  };
  step({ type: "start", at: T0 });
  let t = T0;
  while (!isComplete(state)) step(nextMove(state, (t += SEC)));
  return { state, log };
}

describe("draft reducer: full sequences", () => {
  it.each([
    ["cm-2026", 24, 7],
    ["practice-simple", 18, 4],
  ])("plays %s to completion with legal moves", (rulesetId, steps, bansEach) => {
    const { state } = playAll(create({ rulesetId }));
    expect(state.status).toBe("completed");
    expect(state.stepIndex).toBe(steps);
    expect(state.turns).toHaveLength(steps);
    expect(state.stateVersion).toBe(steps + 1);
    for (const side of ["radiant", "dire"] as const) {
      expect(state.sides[side].picks).toHaveLength(5);
      expect(state.sides[side].bans).toHaveLength(bansEach);
    }
    expect(currentTurn(state)).toBeNull();
    expect(availableHeroes(state, POOL)).toHaveLength(POOL.length - steps);
  });

  it("maps the ruleset's first team onto the chosen first side", () => {
    const radiantFirst = value(send(create({ firstSide: "radiant" }), { type: "start", at: T0 }));
    const direFirst = value(send(create({ firstSide: "dire" }), { type: "start", at: T0 }));
    expect(currentTurn(radiantFirst)).toMatchObject({ side: "radiant", team: "first" });
    expect(currentTurn(direFirst)).toMatchObject({ side: "dire", team: "first" });
  });

  it("records hero and step index for each selection", () => {
    let s = value(send(create(), { type: "start", at: T0 }));
    s = value(send(s, { type: "ban", side: "radiant", heroId: 42, at: T0 + 1 }));
    expect(s.sides.radiant.bans).toEqual([{ heroId: 42, stepIndex: 0 }]);
    expect(s.turns[0]).toEqual({
      stepIndex: 0,
      side: "radiant",
      action: "ban",
      heroId: 42,
      resolution: "chosen",
    });
  });
});

describe("draft reducer: legality", () => {
  const started = (): DraftState => value(send(create(), { type: "start", at: T0 }));

  it("rejects the wrong team", () => {
    expect(errorOf(send(started(), { type: "ban", side: "dire", heroId: 1, at: T0 }))).toEqual({
      type: "wrong_team",
      expected: "radiant",
      actual: "dire",
    });
  });

  it("rejects the wrong action", () => {
    expect(errorOf(send(started(), { type: "pick", side: "radiant", heroId: 1, at: T0 }))).toEqual({
      type: "wrong_action",
      expected: "ban",
      actual: "pick",
    });
  });

  it("rejects a hero that is already picked or banned", () => {
    let s = value(send(started(), { type: "ban", side: "radiant", heroId: 7, at: T0 }));
    s = value(send(s, { type: "ban", side: "radiant", heroId: 8, at: T0 }));
    expect(errorOf(send(s, { type: "ban", side: "dire", heroId: 7, at: T0 }))).toEqual({
      type: "hero_unavailable",
      heroId: 7,
    });
  });

  it("rejects a hero outside the pool", () => {
    expect(
      errorOf(send(started(), { type: "ban", side: "radiant", heroId: 9999, at: T0 })),
    ).toEqual({ type: "hero_not_in_pool", heroId: 9999 });
  });

  it("rejects actions before start and after completion", () => {
    expect(errorOf(send(create(), { type: "ban", side: "radiant", heroId: 1, at: T0 }))).toEqual({
      type: "not_started",
    });
    const { state } = playAll(create());
    expect(
      errorOf(send(state, { type: "pick", side: "radiant", heroId: 130, at: T0 + 99 * SEC })),
    ).toEqual({ type: "draft_completed" });
    expect(errorOf(send(started(), { type: "start", at: T0 }))).toEqual({
      type: "already_started",
    });
  });

  it("rejects a stale expectedVersion without changing state", () => {
    const s = started();
    const staleEvent: DraftEvent = {
      type: "ban",
      side: "radiant",
      heroId: 1,
      at: T0,
      expectedVersion: s.stateVersion - 1,
    };
    expect(errorOf(applyEvent(s, staleEvent, LOCAL))).toEqual({
      type: "stale_version",
      expected: 0,
      actual: 1,
    });
  });

  it("resolves two simultaneous actions once", () => {
    const s = started();
    const a = ev(s, { type: "ban", side: "radiant", heroId: 1, at: T0 });
    const b = ev(s, { type: "ban", side: "radiant", heroId: 2, at: T0 });
    const afterA = value(applyEvent(s, a, MULTI));
    expect(errorOf(applyEvent(afterA, b, MULTI)).type).toBe("stale_version");
  });

  it("rejects events earlier than the last accepted one", () => {
    const s = started();
    expect(errorOf(send(s, { type: "pause", at: T0 - 1 }))).toEqual({
      type: "invalid_timestamp",
      at: T0 - 1,
      lastEventAt: T0,
    });
  });

  it("does not mutate the input state", () => {
    const s = started();
    const snapshot = structuredClone(s);
    value(send(s, { type: "ban", side: "radiant", heroId: 1, at: T0 }));
    expect(s).toEqual(snapshot);
  });

  it("rejects unknown rulesets at creation", () => {
    expect(
      createDraft({ rulesetId: "x", rulesetVersion: 1, firstSide: "dire", timerEnabled: false }),
    ).toEqual({ ok: false, error: { type: "unknown_ruleset", id: "x", version: 1 } });
  });
});

describe("draft reducer: undo, pause, reset", () => {
  it("undoes the last step in local mode", () => {
    let s = value(send(create(), { type: "start", at: T0 }));
    s = value(send(s, { type: "ban", side: "radiant", heroId: 5, at: T0 }));
    const undone = value(send(s, { type: "undo", at: T0 + 1 }));
    expect(undone.stepIndex).toBe(0);
    expect(undone.sides.radiant.bans).toEqual([]);
    expect(undone.turns).toEqual([]);
    expect(undone.stateVersion).toBe(s.stateVersion + 1);
    expect(availableHeroes(undone, POOL)).toContain(5);
  });

  it("undo reopens a completed local draft", () => {
    const { state } = playAll(create({ rulesetId: "practice-simple" }));
    const undone = value(send(state, { type: "undo", at: T0 + 99 * SEC }));
    expect(undone.status).toBe("in_progress");
    expect(currentTurn(undone)).toMatchObject({ stepIndex: 17, side: "dire", action: "pick" });
  });

  it("rejects undo in multiplayer and with nothing to undo", () => {
    let s = value(send(create(), { type: "start", at: T0 }, MULTI));
    expect(errorOf(send(s, { type: "undo", at: T0 }, LOCAL))).toEqual({ type: "nothing_to_undo" });
    s = value(send(s, { type: "ban", side: "radiant", heroId: 5, at: T0 }, MULTI));
    expect(errorOf(send(s, { type: "undo", at: T0 }, MULTI))).toEqual({
      type: "undo_not_allowed",
      mode: "multiplayer",
    });
  });

  it("blocks picks while paused and resumes", () => {
    let s = value(send(create(), { type: "start", at: T0 }));
    s = value(send(s, { type: "pause", at: T0 }));
    expect(s.status).toBe("paused");
    expect(errorOf(send(s, { type: "ban", side: "radiant", heroId: 1, at: T0 }))).toEqual({
      type: "draft_paused",
    });
    expect(errorOf(send(s, { type: "pause", at: T0 }))).toEqual({ type: "draft_paused" });
    s = value(send(s, { type: "resume", at: T0 + SEC }));
    expect(s.status).toBe("in_progress");
    expect(errorOf(send(s, { type: "resume", at: T0 + SEC }))).toEqual({ type: "not_paused" });
  });

  it("reset returns to not_started but keeps counting versions", () => {
    let s = value(send(create(), { type: "start", at: T0 }));
    s = value(send(s, { type: "ban", side: "radiant", heroId: 1, at: T0 }));
    const reset = value(send(s, { type: "reset", at: T0 + SEC }, MULTI));
    expect(reset.status).toBe("not_started");
    expect(reset.turns).toEqual([]);
    expect(reset.stateVersion).toBe(s.stateVersion + 1);
    expect(reset.firstSide).toBe("radiant");
  });
});

describe("draft reducer: replay", () => {
  it("rebuilds the same state as incremental application", () => {
    const initial = create({ timerEnabled: true });
    const { state, log } = playAll(initial);
    expect(value(replay(initial, log, LOCAL))).toEqual(state);
  });

  it("replays logs containing undo, pause, resume and timeout", () => {
    const initial = create({ timerEnabled: true, rulesetId: "practice-simple" });
    const log: DraftEvent[] = [];
    let s = initial;
    const step = (cmd: Command): void => {
      const e = ev(s, cmd);
      s = value(applyEvent(s, e, LOCAL));
      log.push(e);
    };
    step({ type: "start", at: T0 });
    step({ type: "ban", side: "radiant", heroId: 3, at: T0 + SEC });
    step({ type: "undo", at: T0 + 2 * SEC });
    step({ type: "ban", side: "radiant", heroId: 4, at: T0 + 3 * SEC });
    step({ type: "pause", at: T0 + 4 * SEC });
    step({ type: "resume", at: T0 + 60 * SEC });
    step({ type: "timeout", seed: 11, at: T0 + 500 * SEC });
    expect(value(replay(initial, log, LOCAL))).toEqual(s);
  });

  it("reports the index of the first illegal event", () => {
    const initial = create();
    const log: DraftEvent[] = [
      { type: "start", at: T0, expectedVersion: 0 },
      { type: "pick", side: "radiant", heroId: 1, at: T0, expectedVersion: 1 },
    ];
    expect(replay(initial, log, LOCAL)).toEqual({
      ok: false,
      error: { index: 1, error: { type: "wrong_action", expected: "ban", actual: "pick" } },
    });
  });
});

describe("draft timer", () => {
  const cm = value(getRuleset("cm-2026", 1));
  const reserve = cm.timing.reservePerTeamSec * SEC;
  const timedStart = (): DraftState =>
    value(send(create({ timerEnabled: true }), { type: "start", at: T0 }));

  it("stores authoritative turn timestamps", () => {
    const s = timedStart();
    expect(s.timer.turnStartedAt).toBe(T0);
    expect(s.timer.turnDeadline).toBe(T0 + 15 * SEC);
    expect(s.timer.reserveRemainingMs).toEqual({ radiant: reserve, dire: reserve });
  });

  it("is untimed when the timer is off or the draft is not running", () => {
    expect(resolveTime(create({ timerEnabled: true }), T0)).toEqual({ timed: false });
    const s = value(send(create(), { type: "start", at: T0 }));
    expect(resolveTime(s, T0 + 999 * SEC)).toEqual({ timed: false });
    expect(errorOf(send(s, { type: "timeout", seed: 1, at: T0 + 999 * SEC }))).toEqual({
      type: "timer_disabled",
    });
  });

  it("uses turn time first, then reserve, then expires", () => {
    const s = timedStart();
    expect(resolveTime(s, T0 + 10 * SEC)).toMatchObject({
      timed: true,
      side: "radiant",
      expired: false,
      turnRemainingMs: 5 * SEC,
      reserveConsumedMs: 0,
      reserveRemainingMs: reserve,
      expiresAt: T0 + 15 * SEC + reserve,
    });
    expect(resolveTime(s, T0 + 25 * SEC)).toMatchObject({
      expired: false,
      turnRemainingMs: 0,
      reserveConsumedMs: 10 * SEC,
      reserveRemainingMs: reserve - 10 * SEC,
    });
    expect(resolveTime(s, T0 + 15 * SEC + reserve)).toMatchObject({
      expired: true,
      reserveRemainingMs: 0,
    });
  });

  it("deducts consumed reserve from the acting side only", () => {
    let s = timedStart();
    s = value(send(s, { type: "ban", side: "radiant", heroId: 1, at: T0 + 25 * SEC }));
    expect(s.timer.reserveRemainingMs).toEqual({ radiant: reserve - 10 * SEC, dire: reserve });
    expect(s.timer.turnStartedAt).toBe(T0 + 25 * SEC);
    expect(s.timer.turnDeadline).toBe(T0 + 40 * SEC);
  });

  it("rejects a pick after expiry and requires a timeout first", () => {
    const s = timedStart();
    const late = T0 + 15 * SEC + reserve + 1;
    expect(errorOf(send(s, { type: "ban", side: "radiant", heroId: 1, at: late }))).toEqual({
      type: "turn_expired",
      expiredAt: T0 + 15 * SEC + reserve,
    });
    expect(errorOf(send(s, { type: "timeout", seed: 1, at: T0 + 20 * SEC }))).toEqual({
      type: "turn_not_expired",
      expiresAt: T0 + 15 * SEC + reserve,
    });
  });

  it("does not consume time while paused", () => {
    let s = timedStart();
    s = value(send(s, { type: "pause", at: T0 + 5 * SEC }));
    const frozen = resolveTime(s, T0 + 5 * SEC);
    expect(resolveTime(s, T0 + 10_000 * SEC)).toEqual(frozen);
    expect(frozen).toMatchObject({ paused: true, turnRemainingMs: 10 * SEC, expired: false });
    s = value(send(s, { type: "resume", at: T0 + 305 * SEC }));
    expect(s.timer.turnDeadline).toBe(T0 + 315 * SEC);
    expect(resolveTime(s, T0 + 305 * SEC)).toMatchObject({
      paused: false,
      turnRemainingMs: 10 * SEC,
      reserveConsumedMs: 0,
    });
  });

  it("refuses to pause a turn that has already expired", () => {
    const s = timedStart();
    expect(errorOf(send(s, { type: "pause", at: T0 + 15 * SEC + reserve })).type).toBe(
      "turn_expired",
    );
  });

  it("a timed-out ban bans nothing and burns the reserve", () => {
    let s = timedStart();
    const expiresAt = T0 + 15 * SEC + reserve;
    s = value(send(s, { type: "timeout", seed: 1, at: expiresAt + 60 * SEC }));
    expect(s.turns[0]).toEqual({
      stepIndex: 0,
      side: "radiant",
      action: "ban",
      heroId: null,
      resolution: "timeout",
    });
    expect(s.sides.radiant.bans).toEqual([]);
    expect(s.timer.reserveRemainingMs.radiant).toBe(0);
    // Next turn starts when the previous one expired, not when expiry was observed.
    expect(s.timer.turnStartedAt).toBe(expiresAt);
    expect(s.stepIndex).toBe(1);
  });

  it("a timed-out pick is a seeded choice that replays identically", () => {
    const initial = create({ timerEnabled: true, rulesetId: "practice-simple" });
    const log: DraftEvent[] = [];
    let s = initial;
    let t = T0;
    const step = (cmd: Command): void => {
      const e = ev(s, cmd);
      s = value(applyEvent(s, e, LOCAL));
      log.push(e);
    };
    step({ type: "start", at: t });
    for (let i = 0; i < 8; i++) step(nextMove(s, (t += SEC)));
    expect(currentTurn(s)).toMatchObject({ action: "pick", side: "radiant" });
    const res = resolveTime(s, t);
    if (!res.timed) throw new Error("expected timed");
    step({ type: "timeout", seed: 12345, at: res.expiresAt + 5 * SEC });

    const picked = s.sides.radiant.picks[0];
    expect(picked.stepIndex).toBe(8);
    expect(POOL).toContain(picked.heroId);
    expect(s.turns.at(-1)).toMatchObject({ resolution: "timeout", action: "pick" });

    // Same seed, same state → same hero; different seed → (here) a different hero.
    const again = value(replay(initial, log, LOCAL));
    expect(again).toEqual(s);
    const before = value(replay(initial, log.slice(0, -1), LOCAL));
    const lastEvent = log[log.length - 1];
    const other = value(applyEvent(before, { ...lastEvent, seed: 999 } as DraftEvent, LOCAL));
    expect(other.sides.radiant.picks[0].heroId).not.toBe(picked.heroId);
  });

  it("seeded timeout picks do not depend on hero pool order", () => {
    const base = value(
      send(create({ timerEnabled: true, rulesetId: "practice-simple" }), { type: "start", at: T0 }),
    );
    let s = base;
    for (let i = 0; i < 8; i++) s = value(send(s, nextMove(s, T0 + i)));
    const res = resolveTime(s, T0);
    if (!res.timed) throw new Error("expected timed");
    const e = ev(s, { type: "timeout", seed: 7, at: res.expiresAt });
    const a = value(applyEvent(s, e, LOCAL));
    const b = value(applyEvent(s, e, { mode: "local", heroPool: [...POOL].reverse() }));
    expect(a.sides.radiant.picks).toEqual(b.sides.radiant.picks);
  });
});
