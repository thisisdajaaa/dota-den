import {
  compositionFeedback,
  type FeedbackCategory,
  type FeedbackHero,
} from "./composition-feedback";

/**
 * Deterministic fallback for the AI captain when the language model is unavailable.
 * Picks fill the team's weakest composition categories; bans take the hero that would
 * best fill the *opponent's* weakest categories. Ties break by hero id so results replay.
 */
const ROLES_FOR: Record<FeedbackCategory, readonly string[]> = {
  control: ["Disabler"],
  initiation: ["Initiator"],
  durability: ["Durable"],
  push: ["Pusher"],
  carry_core: ["Carry"],
  support: ["Support"],
  damage_profile: ["Nuker", "Carry"],
  range: [],
};

function needs(team: readonly FeedbackHero[]): Map<FeedbackCategory, number> {
  const weights = new Map<FeedbackCategory, number>();
  const findings = team.length
    ? compositionFeedback(team)
    : (Object.keys(ROLES_FOR) as FeedbackCategory[]).map((c) => ({
        category: c,
        level: "weak" as const,
      }));
  for (const f of findings)
    weights.set(f.category, f.level === "weak" ? 3 : f.level === "ok" ? 1 : 0);
  return weights;
}

function fitScore(hero: FeedbackHero, team: readonly FeedbackHero[]): number {
  const w = needs(team);
  let score = 0;
  for (const [category, weight] of w) {
    if (category === "range") {
      const ranged = team.filter((h) => h.attackType === "Ranged").length;
      if (weight > 0 && hero.attackType === (ranged === 0 ? "Ranged" : "Melee")) score += weight;
      continue;
    }
    if (ROLES_FOR[category].some((r) => hero.roles.includes(r))) score += weight;
  }
  // Too many carries is its own problem.
  if (hero.roles.includes("Carry") && team.filter((h) => h.roles.includes("Carry")).length >= 2)
    score -= 3;
  return score;
}

export interface HeuristicChoice {
  heroId: number;
  reason: string;
}

export function heuristicChoice(input: {
  action: "pick" | "ban";
  available: readonly FeedbackHero[];
  ownPicks: readonly FeedbackHero[];
  enemyPicks: readonly FeedbackHero[];
}): HeuristicChoice | null {
  const { action, available, ownPicks, enemyPicks } = input;
  if (available.length === 0) return null;
  const team = action === "pick" ? ownPicks : enemyPicks;
  const ranked = [...available].sort(
    (a, b) => fitScore(b, team) - fitScore(a, team) || a.id - b.id,
  );
  const best = ranked[0];
  const roles = best.roles.slice(0, 3).join(", ") || "flexible";
  return {
    heroId: best.id,
    reason:
      action === "pick"
        ? `${best.name} covers gaps in our lineup (${roles}).`
        : `Banning ${best.name}: it would fill what the enemy lineup is missing (${roles}).`,
  };
}
