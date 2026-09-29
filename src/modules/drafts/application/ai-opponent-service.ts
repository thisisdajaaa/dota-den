import { err, ok, type Result } from "@/modules/shared/domain/result";
import { rankCandidates, lineupNeeds, type ScoringHero } from "../domain/draft-scoring";
import { availableHeroes, currentTurn, type Side } from "../domain/draft-state";
import { getRuleset } from "../domain/rulesets";
import type { DraftAdvisor, DraftInsights } from "./ports";
import { replaySnapshot, type DraftSnapshot } from "./snapshot";

export type AiHero = ScoringHero;

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
  /** "model" = language model chose from the shortlist; "heuristic" = top-scored candidate. */
  source: "model" | "heuristic";
  model: string | null;
}

const SHORTLIST = 12;

function situation(
  action: "pick" | "ban",
  needs: ReturnType<typeof lineupNeeds>,
  forEnemy: boolean,
): string {
  const who = forEnemy ? "The opponent has" : "You have";
  const base = `${who} ${needs.cores} core${needs.cores === 1 ? "" : "s"} and ${needs.supports} support${needs.supports === 1 ? "" : "s"}, with ${needs.picksLeft} pick${needs.picksLeft === 1 ? "" : "s"} left.`;
  if (action === "pick") {
    if (needs.mustPickSupport) return `${base} You must pick a support now.`;
    if (needs.mustPickCore) return `${base} Your supports are filled: pick a core.`;
    return `${base} A lineup wants about 3 cores and 2 supports.`;
  }
  return base;
}

/** Decide the AI captain's move for the current turn of a (client-held) draft. */
export class AiOpponentService {
  constructor(
    private readonly deps: {
      advisor: DraftAdvisor | null;
      insights: DraftInsights | null;
      heroes: readonly AiHero[];
    },
  ) {}

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
    const enemySide: Side = aiSide === "radiant" ? "dire" : "radiant";
    const available = availableHeroes(state, pool)
      .map((id) => byId.get(id))
      .filter((h): h is AiHero => !!h);
    if (available.length === 0) return err({ type: "no_heroes" });

    const own = lookup(state.sides[aiSide].picks);
    const enemy = lookup(state.sides[enemySide].picks);

    // Picks left per side, from the ruleset's remaining steps.
    const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
    const sequence = ruleset.ok ? ruleset.value.sequence : [];
    const firstIsAi = state.firstSide === aiSide;
    const remaining = sequence.slice(state.stepIndex).filter((s) => s.action === "pick");
    const ownPicksLeft = remaining.filter((s) => (s.team === "first") === firstIsAi).length;
    const enemyPicksLeft = remaining.length - ownPicksLeft;

    // Ground the choice in public data: meta plus head-to-heads vs the heroes that matter.
    const relevant = turn.action === "pick" ? enemy : own;
    const [meta, tables] = await Promise.all([
      this.deps.insights?.heroMeta() ?? Promise.resolve(new Map()),
      Promise.all(
        relevant.map(async (h) => [h.id, await this.deps.insights?.matchups(h.id)] as const),
      ),
    ]);
    const matchups = new Map(
      tables.filter((t): t is readonly [number, NonNullable<(typeof t)[1]>] => !!t[1]),
    );

    const candidates = rankCandidates({
      action: turn.action,
      available,
      own,
      enemy,
      ownPicksLeft,
      enemyPicksLeft,
      meta,
      matchups,
      limit: SHORTLIST,
    });
    const best = candidates[0];
    if (!best) return err({ type: "no_heroes" });

    if (this.deps.advisor) {
      const needs =
        turn.action === "pick"
          ? lineupNeeds(own, ownPicksLeft)
          : lineupNeeds(enemy, enemyPicksLeft);
      const suggestion = await this.deps.advisor.suggest({
        action: turn.action,
        side: aiSide,
        stepNumber: turn.stepIndex + 1,
        totalSteps: sequence.length,
        ownPicks: own,
        ownBans: lookup(state.sides[aiSide].bans),
        enemyPicks: enemy,
        enemyBans: lookup(state.sides[enemySide].bans),
        situation: situation(turn.action, needs, turn.action === "ban"),
        candidates: candidates.map((c) => ({
          id: c.heroId,
          name: c.name,
          role: c.role,
          facts: c.facts,
        })),
      });
      // The model may only choose from the shortlist.
      if (suggestion.ok && candidates.some((c) => c.heroId === suggestion.value.heroId)) {
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

    return ok({
      action: turn.action,
      side: aiSide,
      heroId: best.heroId,
      reason:
        turn.action === "pick"
          ? `${best.name}: best fit by the numbers (${best.facts.slice(0, 2).join("; ")}).`
          : `Banning ${best.name}: ${best.facts.slice(0, 2).join("; ")}.`,
      source: "heuristic",
      model: null,
    });
  }
}
