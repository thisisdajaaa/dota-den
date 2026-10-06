/**
 * Transparent, rule-based composition feedback (spec §2.4 "Feedback").
 *
 * Every finding names the heroes behind it and states the rule that produced it. It
 * never produces a win probability or any other score: role tags from OpenDota are
 * coarse (a hero either has "Disabler" or not), so confidence is capped at "medium",
 * and drops to "low" while the lineup is incomplete.
 */

import { phrase, type Phrase } from "./phrase";

export type HeroRole =
  | "Carry"
  | "Support"
  | "Nuker"
  | "Disabler"
  | "Jungler"
  | "Durable"
  | "Escape"
  | "Pusher"
  | "Initiator";

export interface FeedbackHero {
  id: number;
  name: string;
  /** OpenDota role tags; unknown tags are ignored. */
  roles: readonly string[];
  attackType: "Melee" | "Ranged";
  primaryAttr: "str" | "agi" | "int" | "all";
}

export type FeedbackCategory =
  | "control"
  | "initiation"
  | "durability"
  | "push"
  | "damage_profile"
  | "carry_core"
  | "support"
  | "range";

export type FeedbackLevel = "strong" | "ok" | "weak";

export interface CompositionFinding {
  category: FeedbackCategory;
  level: FeedbackLevel;
  reason: string;
  /** The reason for the UI to translate (without the "based on n of 5 picks" note). */
  phrase: Phrase;
  confidence: "low" | "medium";
}

export const FULL_TEAM_SIZE = 5;

const names = (heroes: readonly FeedbackHero[]): string => heroes.map((h) => h.name).join(", ");
const withRole = (heroes: readonly FeedbackHero[], role: HeroRole): FeedbackHero[] =>
  heroes.filter((h) => h.roles.includes(role));

/** "Lion, Tidehunter" or "none" — the evidence clause used in every reason. */
const evidence = (label: string, heroes: readonly FeedbackHero[]): string =>
  heroes.length === 0 ? `No ${label} picked` : `${label} from ${names(heroes)}`;

/** Evidence labels as message ids (`feedback.evidence.<id>`). */
type EvidenceId =
  | "disables"
  | "initiation"
  | "frontline"
  | "push"
  | "support"
  | "carry"
  | "magical"
  | "physical"
  | "ranged"
  | "melee";

const evidencePhrase = (id: EvidenceId, heroes: readonly FeedbackHero[]): Phrase =>
  heroes.length === 0
    ? phrase(`feedback.evidence.${id}.none`)
    : phrase(`feedback.evidence.${id}.some`, { heroes: names(heroes) });

const notePhrase = (category: FeedbackCategory, variant: string) =>
  phrase(`feedback.notes.${category}.${variant}`);

/**
 * Count-based rule for a single role tag.
 * `strongAt`: count at or above which the category is strong; one tag below that is ok;
 * zero is weak.
 */
function roleRule(
  heroes: readonly FeedbackHero[],
  category: FeedbackCategory,
  role: HeroRole,
  label: string,
  id: EvidenceId,
  strongAt: number,
  notes: { strong: string; ok: string; weak: string },
): Omit<CompositionFinding, "confidence"> {
  const contributors = withRole(heroes, role);
  const n = contributors.length;
  const level: FeedbackLevel = n >= strongAt ? "strong" : n >= 1 ? "ok" : "weak";
  return {
    category,
    level,
    reason: `${evidence(label, contributors)}. ${notes[level]}`,
    phrase: phrase("feedback.reason", {
      evidence: evidencePhrase(id, contributors),
      note: notePhrase(category, level),
    }),
  };
}

/**
 * Produce explainable findings for one team's picks. Rules (role tags, counted per hero):
 * - control: Disabler — 3+ strong, 1–2 ok, 0 weak.
 * - initiation: Initiator — 2+ strong, 1 ok, 0 weak.
 * - durability: Durable — 2+ strong, 1 ok, 0 weak.
 * - push: Pusher — 2+ strong, 1 ok, 0 weak.
 * - carry_core: Carry — 1–2 strong, 3+ ok (farm contention), 0 weak.
 * - support: Support — 2+ strong, 1 ok, 0 weak.
 * - damage_profile: Nuker (magical) and Carry (physical right-click) both present strong,
 *   only one present ok (one-dimensional), neither weak.
 * - range: at least 2 ranged and 1 melee strong; all ranged or only 1 ranged ok;
 *   all melee weak.
 * Returns [] for an empty team.
 */
export function compositionFeedback(heroes: readonly FeedbackHero[]): CompositionFinding[] {
  if (heroes.length === 0) return [];
  const confidence: CompositionFinding["confidence"] =
    heroes.length >= FULL_TEAM_SIZE ? "medium" : "low";
  const partial = heroes.length < FULL_TEAM_SIZE ? ` (based on ${heroes.length} of 5 picks)` : "";

  const findings: Omit<CompositionFinding, "confidence">[] = [
    roleRule(heroes, "control", "Disabler", "Disables", "disables", 3, {
      strong: "Plenty of lockdown to catch and hold targets.",
      ok: "Some lockdown, but catches may rely on a single spell landing.",
      weak: "Little reliable lockdown; enemies can escape or channel freely.",
    }),
    roleRule(heroes, "initiation", "Initiator", "Initiation", "initiation", 2, {
      strong: "Multiple ways to start fights.",
      ok: "One initiator; fights may stall if that hero is caught or out of position.",
      weak: "No dedicated initiator; the team may struggle to start fights on its terms.",
    }),
    roleRule(heroes, "durability", "Durable", "Frontline", "frontline", 2, {
      strong: "Several heroes can absorb damage.",
      ok: "One durable hero carries the frontline.",
      weak: "No durable hero; fights may be decided by who gets focused first.",
    }),
    roleRule(heroes, "push", "Pusher", "Push", "push", 2, {
      strong: "Good tools to take towers and end.",
      ok: "Some push, but sieging high ground may be slow.",
      weak: "No dedicated pushers; closing the game may take time.",
    }),
    carryRule(heroes),
    roleRule(heroes, "support", "Support", "Support", "support", 2, {
      strong: "Enough support heroes to cover lanes, vision and saves.",
      ok: "Only one support-tagged hero; vision and saves may be thin.",
      weak: "No support-tagged heroes; lanes and vision may suffer.",
    }),
    damageRule(heroes),
    rangeRule(heroes),
  ];
  return findings.map((f) => ({ ...f, reason: f.reason + partial, confidence }));
}

function carryRule(heroes: readonly FeedbackHero[]): Omit<CompositionFinding, "confidence"> {
  const carries = withRole(heroes, "Carry");
  const n = carries.length;
  const [level, note]: [FeedbackLevel, string] =
    n === 0
      ? ["weak", "No carry-tagged hero to scale into the late game."]
      : n <= 2
        ? ["strong", "A clear core to farm and scale."]
        : ["ok", "Several carries may compete for the same farm."];
  return {
    category: "carry_core",
    level,
    reason: `${evidence("Carry potential", carries)}. ${note}`,
    phrase: phrase("feedback.reason", {
      evidence: evidencePhrase("carry", carries),
      note: notePhrase("carry_core", level),
    }),
  };
}

function damageRule(heroes: readonly FeedbackHero[]): Omit<CompositionFinding, "confidence"> {
  const magical = withRole(heroes, "Nuker");
  const physical = withRole(heroes, "Carry");
  const parts = [evidence("Magical burst", magical), evidence("physical damage", physical)];
  const [level, note, variant]: [FeedbackLevel, string, string] =
    magical.length > 0 && physical.length > 0
      ? ["strong", "Mixed damage is harder to itemize against.", "mixed"]
      : magical.length > 0
        ? ["ok", "Leans magical; enemy magic resistance and spell immunity hurt more.", "magical"]
        : physical.length > 0
          ? ["ok", "Leans physical; enemy armor and evasion hurt more.", "physical"]
          : ["weak", "No nuker or carry tags; damage output is unclear.", "none"];
  return {
    category: "damage_profile",
    level,
    reason: `${parts.join("; ")}. ${note}`,
    phrase: phrase("feedback.reason2", {
      a: evidencePhrase("magical", magical),
      b: evidencePhrase("physical", physical),
      note: notePhrase("damage_profile", variant),
    }),
  };
}

function rangeRule(heroes: readonly FeedbackHero[]): Omit<CompositionFinding, "confidence"> {
  const ranged = heroes.filter((h) => h.attackType === "Ranged");
  const melee = heroes.filter((h) => h.attackType === "Melee");
  const parts = [evidence("Ranged", ranged), evidence("melee", melee)];
  const [level, note, variant]: [FeedbackLevel, string, string] =
    melee.length === 0
      ? ["ok", "All ranged: good poke, but no one naturally stands in front.", "allRanged"]
      : ranged.length === 0
        ? ["weak", "All melee: kiting heroes and high ground defense are hard.", "allMelee"]
        : ranged.length === 1
          ? ["ok", "Only one ranged hero; limited poke and siege.", "oneRanged"]
          : ["strong", "A mix of ranged and melee attackers.", "mixed"];
  return {
    category: "range",
    level,
    reason: `${parts.join("; ")}. ${note}`,
    phrase: phrase("feedback.reason2", {
      a: evidencePhrase("ranged", ranged),
      b: evidencePhrase("melee", melee),
      note: notePhrase("range", variant),
    }),
  };
}
