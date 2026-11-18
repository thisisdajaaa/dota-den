import { describe, expect, it } from "vitest";
import {
  evaluateStopLoss,
  isStopLossActive,
  normalizeStopLoss,
  STOP_LOSS_OFF,
  stopLossKey,
  stopLossReminder,
  trailingLosses,
  type StopLossLimits,
  type StopLossRule,
} from "@/modules/sessions/domain/stop-loss";
import { StopLossInputSchema } from "@/modules/sessions/schemas/sessions.schema";

const on = (limits: Partial<StopLossLimits>) => ({
  enabled: true,
  limits: { ...STOP_LOSS_OFF.limits, ...limits },
});
const games = (s: string) =>
  [...s].map((c) => ({ result: c === "W" ? ("win" as const) : ("loss" as const) }));

describe("evaluateStopLoss", () => {
  it("is null while off, or on without any rule", () => {
    expect(evaluateStopLoss(STOP_LOSS_OFF, games("LLL"))).toBeNull();
    expect(evaluateStopLoss({ ...on({ losses: 2 }), enabled: false }, games("LL"))).toBeNull();
    expect(evaluateStopLoss(on({}), games("LL"))).toBeNull();
    expect(isStopLossActive(on({}))).toBe(false);
  });

  it("counts losses in the session, wins in between or not", () => {
    const s = on({ losses: 2 });
    expect(evaluateStopLoss(s, games("WLW"))).toEqual({
      rules: [{ rule: "losses", limit: 2, used: 1, reached: false }],
      reached: [],
    });
    expect(evaluateStopLoss(s, games("LWL"))?.reached).toEqual(["losses"]);
    // Past the limit is still reached (the player kept going).
    expect(evaluateStopLoss(s, games("LWLL"))?.rules[0]).toMatchObject({ used: 3, reached: true });
  });

  it("counts only the losses in a row at the end for the streak rule", () => {
    const s = on({ streak: 3 });
    expect(evaluateStopLoss(s, games("LLWLL"))?.rules[0]).toMatchObject({
      used: 2,
      reached: false,
    });
    expect(evaluateStopLoss(s, games("WLLL"))?.reached).toEqual(["streak"]);
    // A win resets it.
    expect(evaluateStopLoss(s, games("LLLW"))?.rules[0]).toMatchObject({ used: 0, reached: false });
    expect(trailingLosses(games(""))).toBe(0);
  });

  it("counts every game for the games rule", () => {
    const s = on({ games: 3 });
    expect(evaluateStopLoss(s, games("WW"))?.reached).toEqual([]);
    expect(evaluateStopLoss(s, games("WWW"))?.reached).toEqual(["games"]);
  });

  it("checks every set rule, in a fixed order", () => {
    const s = on({ games: 4, streak: 2, losses: 2 });
    const status = evaluateStopLoss(s, games("WLL"))!;
    expect(status.rules.map((r) => [r.rule, r.used])).toEqual([
      ["losses", 2],
      ["streak", 2],
      ["games", 3],
    ]);
    expect(status.reached).toEqual(["losses", "streak"]);
  });
});

describe("stopLossReminder (once per session per rule)", () => {
  const s = on({ losses: 2, streak: 2, games: 4 });

  it("names the first newly reached rule and lists every new one", () => {
    const r = stopLossReminder(evaluateStopLoss(s, games("WLL")), new Set());
    expect(r?.rule).toMatchObject({ rule: "losses", limit: 2, used: 2 });
    expect(r?.fresh).toEqual(["losses", "streak"]);
  });

  it("stays quiet on later games once those rules were reminded", () => {
    const sent = new Set<StopLossRule>(["losses", "streak"]);
    // Game 4 (another loss): nothing new… except the games limit, reached on this game.
    expect(stopLossReminder(evaluateStopLoss(s, games("WLL")), sent)).toBeNull();
    const r = stopLossReminder(evaluateStopLoss(s, games("WLLL")), sent);
    expect(r?.rule.rule).toBe("games");
    expect(r?.fresh).toEqual(["games"]);
    sent.add("games");
    expect(stopLossReminder(evaluateStopLoss(s, games("WLLLL")), sent)).toBeNull();
  });

  it("has nothing to say before a limit is reached or when off", () => {
    expect(stopLossReminder(evaluateStopLoss(s, games("WL")), new Set())).toBeNull();
    expect(stopLossReminder(null, new Set())).toBeNull();
  });

  it("keys each rule by session", () => {
    expect(stopLossKey("7:123", "losses")).toBe("7:123:losses");
    expect(stopLossKey("7:124", "losses")).not.toBe(stopLossKey("7:123", "losses"));
  });
});

describe("stored and submitted settings", () => {
  it("defaults to off and drops out-of-range values", () => {
    expect(normalizeStopLoss(undefined)).toEqual(STOP_LOSS_OFF);
    expect(
      normalizeStopLoss({ enabled: true, limits: { losses: 0, streak: 1, games: 2.5 } }),
    ).toEqual({ enabled: true, limits: { losses: null, streak: null, games: null } });
    expect(normalizeStopLoss({ enabled: "yes", limits: { losses: 3 } })).toEqual({
      enabled: false,
      limits: { losses: 3, streak: null, games: null },
    });
  });

  it("validates ranges and needs a rule when on", () => {
    const ok = { enabled: true, limits: { losses: 2, streak: null, games: 20 } };
    expect(StopLossInputSchema.safeParse(ok).success).toBe(true);
    expect(
      StopLossInputSchema.safeParse({ enabled: false, limits: STOP_LOSS_OFF.limits }).success,
    ).toBe(true);
    for (const limits of [
      { losses: 0, streak: null, games: null },
      { losses: 11, streak: null, games: null },
      { losses: null, streak: 1, games: null },
      { losses: null, streak: null, games: 21 },
      { losses: 2.5, streak: null, games: null },
      { losses: null, streak: null, games: null },
    ]) {
      expect(StopLossInputSchema.safeParse({ enabled: true, limits }).success).toBe(false);
    }
    expect(StopLossInputSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});
