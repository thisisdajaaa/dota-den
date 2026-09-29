import { err, ok, type Result } from "@/modules/shared/domain/result";
import { heuristicChoice } from "../domain/ai-heuristic";
import type { FeedbackHero } from "../domain/composition-feedback";
import { availableHeroes, currentTurn, type Side } from "../domain/draft-state";
import { getRuleset } from "../domain/rulesets";
import type { DraftAdvisor } from "./ports";
import { replaySnapshot, type DraftSnapshot } from "./snapshot";

export interface AiHero extends FeedbackHero {
  roles: string[];
}

export type AiMoveError =
  | { type: "invalid_snapshot" }
  | { type: "not_ai_turn" }
  | { type: "draft_complete" }
  | { type: "no_heroes" };

export interface AiMove {
  action: "pick" | "ban";
  side: Side;
  heroId: number;
  reason: string;
  /** "model" = language model; "heuristic" = deterministic fallback. */
  source: "model" | "heuristic";
  model: string | null;
}

/** Decide the AI captain's move for the current turn of a (client-held) draft. */
export class AiOpponentService {
  constructor(private readonly deps: { advisor: DraftAdvisor | null; heroes: readonly AiHero[] }) {}

  async move(snapshot: DraftSnapshot, aiSide: Side): Promise<Result<AiMove, AiMoveError>> {
    const pool = this.deps.heroes.map((h) => h.id);
    // The engine is the referee: a tampered or illegal board never reaches the model.
    const replayed = replaySnapshot(snapshot, pool);
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    const state = replayed.value;
    const turn = currentTurn(state);
    if (!turn) return err({ type: "draft_complete" });
    if (turn.side !== aiSide) return err({ type: "not_ai_turn" });

    const byId = new Map(this.deps.heroes.map((h) => [h.id, h]));
    const lookup = (ids: readonly { heroId: number }[]) =>
      ids.map((s) => byId.get(s.heroId)).filter((h): h is AiHero => !!h);
    const enemy: Side = aiSide === "radiant" ? "dire" : "radiant";
    const available = availableHeroes(state, pool)
      .map((id) => byId.get(id))
      .filter((h): h is AiHero => !!h);
    if (available.length === 0) return err({ type: "no_heroes" });

    const ownPicks = lookup(state.sides[aiSide].picks);
    const enemyPicks = lookup(state.sides[enemy].picks);
    const legal = new Set(available.map((h) => h.id));

    if (this.deps.advisor) {
      const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
      const suggestion = await this.deps.advisor.suggest({
        action: turn.action,
        side: aiSide,
        stepNumber: turn.stepIndex + 1,
        totalSteps: ruleset.ok ? ruleset.value.sequence.length : state.turns.length + 1,
        ownPicks,
        ownBans: lookup(state.sides[aiSide].bans),
        enemyPicks,
        enemyBans: lookup(state.sides[enemy].bans),
        available,
      });
      if (suggestion.ok && legal.has(suggestion.value.heroId)) {
        return ok({
          action: turn.action,
          side: aiSide,
          heroId: suggestion.value.heroId,
          reason: suggestion.value.reason,
          source: "model",
          model: this.deps.advisor.model,
        });
      }
    }

    const fallback = heuristicChoice({ action: turn.action, available, ownPicks, enemyPicks });
    if (!fallback) return err({ type: "no_heroes" });
    return ok({ action: turn.action, side: aiSide, ...fallback, source: "heuristic", model: null });
  }
}
