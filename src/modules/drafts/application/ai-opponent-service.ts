import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  lineupNeeds,
  rankCandidates,
  type Candidate,
  type ScoringHero,
} from "../domain/draft-scoring";
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

interface RankedTurn {
  action: "pick" | "ban";
  stepIndex: number;
  totalSteps: number;
  own: AiHero[];
  enemy: AiHero[];
  ownBans: AiHero[];
  enemyBans: AiHero[];
  situation: string;
  candidates: Candidate[];
}

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

  /**
   * Shared first half of every decision: validate the draft, then rank the legal options for
   * `side`'s current turn with public data and lineup rules.
   */
  private async rank(
    snapshot: DraftSnapshot,
    side: Side,
    limit: number,
  ): Promise<Result<RankedTurn, AiMoveError>> {
    const pool = this.deps.heroes.map((h) => h.id);
    // The engine is the referee: a tampered or illegal board never gets further.
    const replayed = replaySnapshot(snapshot, pool);
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    const state = replayed.value;
    const turn = currentTurn(state);
    if (!turn) return err({ type: "draft_complete" });
    if (turn.side !== side) return err({ type: "not_ai_turn" });

    const byId = new Map(this.deps.heroes.map((h) => [h.id, h]));
    const lookup = (ids: readonly { heroId: number }[]) =>
      ids.map((s) => byId.get(s.heroId)).filter((h): h is AiHero => !!h);
    const enemySide: Side = side === "radiant" ? "dire" : "radiant";
    const available = availableHeroes(state, pool)
      .map((id) => byId.get(id))
      .filter((h): h is AiHero => !!h);
    if (available.length === 0) return err({ type: "no_heroes" });

    const own = lookup(state.sides[side].picks);
    const enemy = lookup(state.sides[enemySide].picks);

    // Picks left per side, from the ruleset's remaining steps.
    const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
    const sequence = ruleset.ok ? ruleset.value.sequence : [];
    const firstIsSide = state.firstSide === side;
    const remaining = sequence.slice(state.stepIndex).filter((s) => s.action === "pick");
    const ownPicksLeft = remaining.filter((s) => (s.team === "first") === firstIsSide).length;
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
      limit,
    });
    if (candidates.length === 0) return err({ type: "no_heroes" });
    const needs =
      turn.action === "pick" ? lineupNeeds(own, ownPicksLeft) : lineupNeeds(enemy, enemyPicksLeft);
    return ok({
      action: turn.action,
      stepIndex: turn.stepIndex,
      totalSteps: sequence.length,
      own,
      enemy,
      ownBans: lookup(state.sides[side].bans),
      enemyBans: lookup(state.sides[enemySide].bans),
      situation: situation(turn.action, needs, turn.action === "ban"),
      candidates,
    });
  }

  /** Data-only suggestions for a human's turn (no language model: instant and free). */
  async suggestions(
    snapshot: DraftSnapshot,
    side: Side,
    limit = 5,
  ): Promise<
    Result<{ action: "pick" | "ban"; situation: string; candidates: Candidate[] }, AiMoveError>
  > {
    // Rank deeper than we show, so the list can mix roles when both are still open.
    const ranked = await this.rank(snapshot, side, 30);
    if (!ranked.ok) return ranked;
    const { action, situation: text, candidates } = ranked.value;
    const roles = new Set(candidates.map((c) => c.role));
    if (action !== "pick" || roles.size < 2) {
      return ok({ action, situation: text, candidates: candidates.slice(0, limit) });
    }
    const supportSlots = Math.min(2, Math.floor(limit / 2));
    const supports = candidates.filter((c) => c.role === "support").slice(0, supportSlots);
    const cores = candidates.filter((c) => c.role === "core").slice(0, limit - supports.length);
    // Keep overall score order within the mixed list.
    const mixed = [...cores, ...supports].sort((a, b) => b.score - a.score);
    return ok({ action, situation: text, candidates: mixed });
  }

  async move(snapshot: DraftSnapshot, aiSide: Side): Promise<Result<AiMove, AiMoveError>> {
    const ranked = await this.rank(snapshot, aiSide, SHORTLIST);
    if (!ranked.ok) return ranked;
    const { action, stepIndex, totalSteps, own, enemy, ownBans, enemyBans, candidates } =
      ranked.value;
    const turn = { action, stepIndex };
    const best = candidates[0];

    if (this.deps.advisor) {
      const suggestion = await this.deps.advisor.suggest({
        action: turn.action,
        side: aiSide,
        stepNumber: turn.stepIndex + 1,
        totalSteps,
        ownPicks: own,
        ownBans,
        enemyPicks: enemy,
        enemyBans,
        situation: ranked.value.situation,
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
