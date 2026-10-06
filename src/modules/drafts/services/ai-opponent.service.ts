import { err, ok, type Result } from "@/common/result";
import type { RoleMaps } from "../schemas/roles.schema";
import { draftOutlook, type DraftOutlook } from "../domain/draft-outlook";
import {
  assignPositions,
  POSITION_NAMES,
  positionLabel,
  positionPhrase,
  type Position,
  type PositionTable,
} from "../domain/draft-positions";
import {
  contestRate,
  lineupNeeds,
  proSource,
  rankCandidates,
  type Candidate,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type SynergyTable,
} from "../domain/draft-scoring";
import { availableHeroes, currentTurn, type DraftState, type Side } from "../domain/draft-state";
import { getRuleset } from "../domain/rulesets";
import type { LaneTable } from "../domain/draft-lanes";
import { applyAdjustments, validateReview, type DraftReview } from "../domain/draft-review";
import type { AbilityCatalog, DraftAdvisor, DraftInsights, DraftReviewer } from "../drafts.ports";
import { replaySnapshot, type DraftSnapshot } from "../domain/snapshot";
import { phrase, type Phrase } from "../domain/phrase";
import type {
  AiHero,
  AiMove,
  AiMoveError,
  ReviewCache,
  ReviewError,
  ReviewResult,
} from "../dtos/responses/drafts.dto";

/** Cache key: the draft, any positions set by hand, and the model. */
function reviewKey(
  snapshot: DraftSnapshot,
  roles: Partial<Record<Side, ReadonlyMap<number, Position>>> | undefined,
  model: string,
): string {
  const r = (side: Side) =>
    [...(roles?.[side]?.entries() ?? [])].sort((a, b) => a[0] - b[0]).map(([h, p]) => `${h}:${p}`);
  return `review-v1:${model}:${JSON.stringify(snapshot)}:${r("radiant")}|${r("dire")}`;
}

/** The evidence we give the reviewer: the numbers behind the report card, in plain lines. */
function reviewEvidence(o: DraftOutlook): string[] {
  const lines: string[] = [];
  if (o.radiantPct !== null) {
    lines.push(
      `Estimated win chance from the draft: Radiant ${o.radiantPct}%, Dire ${100 - o.radiantPct}%.`,
    );
  }
  for (const side of ["radiant", "dire"] as const) {
    const r = o.report[side];
    const name = side === "radiant" ? "Radiant" : "Dire";
    lines.push(`${name} report card: ${r.grade ?? "-"} (${r.overall ?? "-"}/100).`);
    for (const c of r.criteria)
      lines.push(`${name} ${c.label}: ${c.grade ?? "no data"}. ${c.summary}`);
  }
  for (const l of o.lanes) {
    if (l.edge === null) continue;
    const src =
      l.source === "pro_lanes"
        ? `won ${l.wins} of ${l.games} pro lane meetings`
        : "whole-game head-to-heads";
    lines.push(`${l.label}: Radiant edge ${l.edge} points (${src}).`);
  }
  for (const h of o.heroes) {
    const bits = [
      h.winRate !== null ? `${(h.winRate * 100).toFixed(1)}% win rate at high ranks` : null,
      h.bestMatchup ? `best vs ${h.bestMatchup.name} +${h.bestMatchup.edge.toFixed(1)}` : null,
      h.worstMatchup ? `worst vs ${h.worstMatchup.name} ${h.worstMatchup.edge.toFixed(1)}` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`${h.name}: ${bits.join("; ")}.`);
  }
  lines.push(...o.notes);
  return lines;
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
  /** The situation for the UI to translate. */
  situationPhrase: Phrase;
  candidates: Candidate[];
  metaContext: string[];
  /** Whether positions come from pro games (else they're a role-tag guess). */
  positionsKnown: boolean;
}

interface DraftData {
  meta: ReadonlyMap<number, HeroMeta>;
  matchups: Map<number, MatchupTable>;
  pro: ProMeta | undefined;
  synergy: SynergyTable | undefined;
  positions: PositionTable | undefined;
  lanes: LaneTable | undefined;
}

/** What the tournaments are fighting over right now, in a few lines for the model. */
function metaContext(pro: ProMeta | undefined, byId: ReadonlyMap<number, AiHero>): string[] {
  if (!pro) return [];
  const top = [...pro.heroes.entries()]
    .map(([id, stat]) => ({ id, stat, contest: contestRate(stat, pro) }))
    .filter((x) => byId.has(x.id))
    .sort((a, b) => b.contest - a.contest)
    .slice(0, 10)
    .map((x) => `${byId.get(x.id)!.name} ${Math.round(x.contest * 100)}%`);
  return [
    `Recent tournaments (${proSource(pro)}, ${pro.matches} drafts).`,
    `Most contested heroes (share of drafts that picked or banned them): ${top.join(", ")}.`,
  ];
}

/** "Your lineup: Luna (Carry), Lina (Mid). Open: Offlane, Soft support, Hard support." */
function positionSituation(
  action: "pick" | "ban",
  team: readonly AiHero[],
  positions: PositionTable | undefined,
  picksLeft: number,
  fixed?: ReadonlyMap<number, Position>,
): string {
  const forEnemy = action === "ban";
  const { heroes, open } = assignPositions(team, positions, fixed);
  const byId = new Map(team.map((h) => [h.id, h.name]));
  const lineup = heroes.length
    ? [...heroes]
        .sort((a, b) => a.position - b.position)
        .map((h) => `${byId.get(h.heroId)} (${POSITION_NAMES[h.position]})`)
        .join(", ")
    : "no heroes yet";
  const left = `${picksLeft} pick${picksLeft === 1 ? "" : "s"} left`;
  const openText = open.map((p) => POSITION_NAMES[p]).join(", ");
  return forEnemy
    ? `The opponent's lineup: ${lineup}. They still need: ${openText} (${left}).`
    : `Your lineup: ${lineup}. Still open: ${openText} (${left}). Pick a hero for one of the open positions.`;
}

/** `positionSituation` for the UI to translate. */
function positionSituationPhrase(
  action: "pick" | "ban",
  team: readonly AiHero[],
  positions: PositionTable | undefined,
  picksLeft: number,
  fixed?: ReadonlyMap<number, Position>,
): Phrase {
  const { heroes, open } = assignPositions(team, positions, fixed);
  const byId = new Map(team.map((h) => [h.id, h.name]));
  const vars = {
    lineup: heroes.length
      ? [...heroes]
          .sort((a, b) => a.position - b.position)
          .map((h) =>
            phrase("situation.heroAt", {
              hero: byId.get(h.heroId) ?? "",
              position: positionPhrase(h.position),
            }),
          )
      : phrase("situation.noHeroes"),
    open: open.map(positionPhrase),
    left: phrase("count.picksLeft", undefined, picksLeft),
  };
  return phrase(action === "ban" ? "situation.enemyLineup" : "situation.ownLineup", vars);
}

/** `situation` for the UI to translate. */
function countsSituationPhrase(
  action: "pick" | "ban",
  needs: ReturnType<typeof lineupNeeds>,
  forEnemy: boolean,
): Phrase {
  const base = phrase(forEnemy ? "situation.countsEnemy" : "situation.counts", {
    cores: phrase("count.cores", undefined, needs.cores),
    supports: phrase("count.supports", undefined, needs.supports),
    left: phrase("count.picksLeft", undefined, needs.picksLeft),
  });
  if (action !== "pick") return base;
  const hint = needs.mustPickSupport
    ? "situation.mustSupport"
    : needs.mustPickCore
      ? "situation.mustCore"
      : "situation.balance";
  return phrase("situation.withHint", { base, hint: phrase(hint) });
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
      /** The AI review of finished drafts; null when no model is configured. */
      reviewer?: DraftReviewer | null;
      abilities?: AbilityCatalog | null;
      /** Reviews by draft (and positions): a review costs a model call. */
      reviewCache?: ReviewCache | null;
    },
  ) {}

  /**
   * An AI review of a finished draft: combos, win conditions and matchups from the heroes'
   * current abilities and our evidence, plus small, reasoned nudges to two report-card grades.
   */
  async review(
    snapshot: DraftSnapshot,
    roles?: Partial<Record<Side, ReadonlyMap<number, Position>>>,
  ): Promise<Result<ReviewResult, ReviewError>> {
    const replayed = replaySnapshot(
      snapshot,
      this.deps.heroes.map((h) => h.id),
    );
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    if (replayed.value.status !== "completed") return err({ type: "draft_incomplete" });
    const reviewer = this.deps.reviewer;
    if (!reviewer) return err({ type: "not_configured" });

    const outlook = await this.outlook(snapshot, roles);
    if (!outlook.ok) return err({ type: "invalid_snapshot" });
    const o = outlook.value;
    const key = reviewKey(snapshot, roles, reviewer.model);
    const cached = await this.deps.reviewCache?.get(key).catch(() => null);
    const names = o.heroes.map((h) => h.name);
    if (cached) {
      const review = validateReview(cached, names);
      if (review) return ok(this.reviewResult(o, review, reviewer.model));
    }

    const kits =
      (await this.deps.abilities?.kits(o.heroes.map((h) => h.heroId)).catch(() => null)) ??
      new Map();
    const lineup = (side: Side) =>
      o.heroes
        .filter((h) => h.side === side)
        .sort((a, b) => (a.position ?? 9) - (b.position ?? 9))
        .map((h) => ({
          name: h.name,
          position: h.position ? positionLabel(h.position) : "position unknown",
          abilities: kits.get(h.heroId)?.abilities ?? [],
        }));
    const res = await reviewer.review({
      lineups: { radiant: lineup("radiant"), dire: lineup("dire") },
      evidence: reviewEvidence(o),
    });
    if (!res.ok) return err({ type: "unavailable" });
    const review = validateReview(res.value, names);
    if (!review) return err({ type: "unavailable" });
    await this.deps.reviewCache?.put(key, res.value).catch(() => undefined);
    return ok(this.reviewResult(o, review, reviewer.model));
  }

  private reviewResult(o: DraftOutlook, review: DraftReview, model: string): ReviewResult {
    return {
      review,
      model,
      report: o.report,
      adjusted: applyAdjustments(o.report, review.adjustments),
    };
  }

  /**
   * Shared first half of every decision: validate the draft, then rank the legal options for
   * `side`'s current turn with public data and lineup rules.
   */
  private async rank(
    snapshot: DraftSnapshot,
    side: Side,
    limit: number,
    /** Positions set by hand, per side (hero id -> position). */
    roles: RoleMaps = {},
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

    // Ground the choice in public data: meta, tournaments, and head-to-heads vs the heroes
    // that matter.
    const relevant = turn.action === "pick" ? enemy : own;
    const { meta, matchups, pro, synergy, positions, lanes } = await this.data(relevant);

    const candidates = rankCandidates({
      action: turn.action,
      available,
      own,
      enemy,
      ownPicksLeft,
      enemyPicksLeft,
      meta,
      matchups,
      pro,
      synergy,
      positions,
      lanes,
      fixed: { own: roles[side], enemy: roles[enemySide] },
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
      situation: positions
        ? positionSituation(
            turn.action,
            turn.action === "pick" ? own : enemy,
            positions,
            turn.action === "pick" ? ownPicksLeft : enemyPicksLeft,
            turn.action === "pick" ? roles[side] : roles[enemySide],
          )
        : situation(turn.action, needs, turn.action === "ban"),
      situationPhrase: positions
        ? positionSituationPhrase(
            turn.action,
            turn.action === "pick" ? own : enemy,
            positions,
            turn.action === "pick" ? ownPicksLeft : enemyPicksLeft,
            turn.action === "pick" ? roles[side] : roles[enemySide],
          )
        : countsSituationPhrase(turn.action, needs, turn.action === "ban"),
      candidates,
      metaContext: metaContext(pro, byId),
      positionsKnown: positions !== undefined,
    });
  }

  /** Public stats, tournament data, and matchup tables for `picked`. Failures mean "no data". */
  private async data(picked: readonly AiHero[]): Promise<DraftData> {
    const insights = this.deps.insights;
    const [meta, tables, pro, synergy, positions, lanes] = await Promise.all([
      insights?.heroMeta() ?? Promise.resolve(new Map<number, HeroMeta>()),
      Promise.all(picked.map(async (h) => [h.id, await insights?.matchups(h.id)] as const)),
      insights?.proMeta?.().catch(() => null) ?? Promise.resolve(null),
      insights?.synergy?.().catch(() => null) ?? Promise.resolve(null),
      insights?.positions?.().catch(() => null) ?? Promise.resolve(null),
      insights?.lanes?.().catch(() => null) ?? Promise.resolve(null),
    ]);
    const matchups = new Map<number, MatchupTable>();
    for (const [id, table] of tables) if (table) matchups.set(id, table);
    return {
      meta,
      matchups,
      pro: pro ?? undefined,
      synergy: synergy ?? undefined,
      positions: positions ?? undefined,
      lanes: lanes ?? undefined,
    };
  }

  /** Which side the draft favours so far, with the evidence. Works on partial drafts. */
  async outlook(
    snapshot: DraftSnapshot,
    /** Positions set by hand, per side (hero id -> position). */
    roles?: Partial<Record<Side, ReadonlyMap<number, Position>>>,
  ): Promise<Result<DraftOutlook, AiMoveError>> {
    const replayed = replaySnapshot(
      snapshot,
      this.deps.heroes.map((h) => h.id),
    );
    if (!replayed.ok) return err({ type: "invalid_snapshot" });
    const state: DraftState = replayed.value;
    const byId = new Map(this.deps.heroes.map((h) => [h.id, h]));
    const team = (side: Side) =>
      state.sides[side].picks.map((p) => byId.get(p.heroId)).filter((h): h is AiHero => !!h);
    const radiant = team("radiant");
    const dire = team("dire");
    const data = await this.data([...radiant, ...dire]);
    const ruleset = getRuleset(state.rulesetId, state.rulesetVersion);
    const picksPerSide = ruleset.ok
      ? ruleset.value.sequence.filter((s) => s.action === "pick").length / 2
      : 5;
    return ok(draftOutlook({ radiant, dire, ...data, fixed: roles, picksPerSide }));
  }

  /**
   * The outlook for two lineups given as hero ids (e.g. a live game), without a draft
   * sequence. Unknown hero ids are ignored.
   */
  async outlookForHeroes(
    radiantIds: readonly number[],
    direIds: readonly number[],
  ): Promise<DraftOutlook> {
    const byId = new Map(this.deps.heroes.map((h) => [h.id, h]));
    const pick = (ids: readonly number[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((h): h is AiHero => !!h)
        .slice(0, 5);
    const radiant = pick(radiantIds);
    const dire = pick(direIds);
    const data = await this.data([...radiant, ...dire]);
    return draftOutlook({ radiant, dire, ...data, picksPerSide: 5 });
  }

  /** Data-only suggestions for a human's turn (no language model: instant and free). */
  async suggestions(
    snapshot: DraftSnapshot,
    side: Side,
    limit = 5,
    /** Positions set by hand: open positions and lanes follow them. */
    handRoles: RoleMaps = {},
  ): Promise<
    Result<
      {
        action: "pick" | "ban";
        situation: string;
        situationPhrase: Phrase;
        candidates: Candidate[];
      },
      AiMoveError
    >
  > {
    // Rank deeper than we show, so the list can cover every open position.
    const ranked = await this.rank(snapshot, side, 60, handRoles);
    if (!ranked.ok) return ranked;
    const { action, situation: text, situationPhrase, candidates, positionsKnown } = ranked.value;
    if (action === "pick" && positionsKnown) {
      // The best hero for each open position first, then the strongest of the rest.
      const open = [...new Set(candidates.map((c) => c.position))].filter(
        (p): p is Position => p !== null,
      );
      const perPosition = open
        .sort((a, b) => a - b)
        .map((p) => candidates.find((c) => c.position === p)!)
        .slice(0, limit);
      const rest = candidates.filter((c) => !perPosition.includes(c));
      const picked = [...perPosition, ...rest].slice(0, limit);
      return ok({
        action,
        situation: text,
        situationPhrase,
        candidates: picked.sort(
          (a, b) => (a.position ?? 9) - (b.position ?? 9) || b.score - a.score,
        ),
      });
    }
    const roles = new Set(candidates.map((c) => c.role));
    if (action !== "pick" || roles.size < 2) {
      return ok({
        action,
        situation: text,
        situationPhrase,
        candidates: candidates.slice(0, limit),
      });
    }
    const supportSlots = Math.min(2, Math.floor(limit / 2));
    const supports = candidates.filter((c) => c.role === "support").slice(0, supportSlots);
    const cores = candidates.filter((c) => c.role === "core").slice(0, limit - supports.length);
    // Keep overall score order within the mixed list.
    const mixed = [...cores, ...supports].sort((a, b) => b.score - a.score);
    return ok({ action, situation: text, situationPhrase, candidates: mixed });
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
        metaContext: ranked.value.metaContext,
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
