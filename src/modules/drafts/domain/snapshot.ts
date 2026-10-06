import { z } from "zod";
import { err, ok, type Result } from "@/common/result";
import {
  applyEvent,
  createDraft,
  currentTurn,
  type DraftEvent,
  type DraftState,
  type Side,
} from "./draft-state";

/**
 * A shareable, read-only draft: ruleset, first side and the hero chosen at each step
 * (null = skipped ban). Rebuilt by replaying through the engine, so a tampered link can
 * never produce an illegal board.
 */
const SnapshotSchema = z.object({
  v: z.literal(1),
  r: z.string().min(1).max(40),
  rv: z.number().int().min(1).max(1000),
  f: z.enum(["radiant", "dire"]),
  t: z.array(z.number().int().min(1).max(1000).nullable()).max(40),
});

export type DraftSnapshot = z.infer<typeof SnapshotSchema>;
export type SnapshotError = { type: "invalid_snapshot"; reason: string };

export function snapshotOf(state: DraftState): DraftSnapshot {
  return {
    v: 1,
    r: state.rulesetId,
    rv: state.rulesetVersion,
    f: state.firstSide,
    t: state.turns.map((t) => t.heroId),
  };
}

export function encodeSnapshot(s: DraftSnapshot): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeSnapshot(encoded: string): Result<DraftSnapshot, SnapshotError> {
  if (encoded.length > 2_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return err({ type: "invalid_snapshot", reason: "malformed" });
  }
  try {
    const bin = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const json: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))),
    );
    const parsed = SnapshotSchema.safeParse(json);
    return parsed.success ? ok(parsed.data) : err({ type: "invalid_snapshot", reason: "schema" });
  } catch {
    return err({ type: "invalid_snapshot", reason: "malformed" });
  }
}

/**
 * Rebuild the board by replaying each step through the engine. The timer is on with
 * synthetic timestamps so a skipped ban (null) replays as a genuine timed-out ban.
 */
export function replaySnapshot(
  s: DraftSnapshot,
  heroPool: readonly number[],
): Result<DraftState, SnapshotError> {
  const created = createDraft({
    rulesetId: s.r,
    rulesetVersion: s.rv,
    firstSide: s.f as Side,
    timerEnabled: true,
  });
  if (!created.ok) return err({ type: "invalid_snapshot", reason: "unknown_ruleset" });
  const ctx = { mode: "local" as const, heroPool };
  let state = created.value;
  const next = (event: DraftEvent): boolean => {
    const res = applyEvent(state, event, ctx);
    if (res.ok) state = res.value;
    return res.ok;
  };

  if (!next({ type: "start", expectedVersion: state.stateVersion, at: 1 })) {
    return err({ type: "invalid_snapshot", reason: "start_failed" });
  }
  for (const heroId of s.t) {
    const turn = currentTurn(state);
    if (!turn) return err({ type: "invalid_snapshot", reason: "too_many_steps" });
    const base = { expectedVersion: state.stateVersion };
    if (heroId === null) {
      if (turn.action !== "ban") return err({ type: "invalid_snapshot", reason: "skipped_pick" });
      const expiresAt =
        (state.timer.turnDeadline ?? 0) + state.timer.reserveRemainingMs[turn.side] + 1;
      if (!next({ ...base, type: "timeout", seed: 0, at: expiresAt })) {
        return err({ type: "invalid_snapshot", reason: "timeout_failed" });
      }
      continue;
    }
    const at = (state.lastEventAt ?? 1) + 1;
    if (!next({ ...base, type: turn.action, side: turn.side, heroId, at })) {
      return err({ type: "invalid_snapshot", reason: "illegal_step" });
    }
  }
  return ok(state);
}
