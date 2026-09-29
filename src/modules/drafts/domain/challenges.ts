/**
 * Draft challenges: short drafting puzzles (pure, deterministic).
 *
 * A puzzle is generated from the hero catalog and a seed only, so the same `{type, seed}`
 * always produces the same position: the URL is the share link, and the server can rebuild
 * the position to referee an answer without trusting anything the client sends. Public
 * stats are used for grading, never for generation (they refresh every few hours, and a
 * shared link must keep pointing at the same position).
 *
 * Grading reuses `rankCandidates` (the same numbers as the AI captain) and reports a band,
 * the evidence behind it and the best alternatives. It never outputs a win probability.
 */
import { err, ok, type Result } from "@/modules/shared/domain/result";
import {
  canSupport,
  CORE_SLOTS,
  lineupNeeds,
  lineupRole,
  rankCandidates,
  SUPPORT_SLOTS,
  type Candidate,
  type HeroMeta,
  type LineupRole,
  type MatchupTable,
  type ScoringHero,
} from "./draft-scoring";

export const CHALLENGE_TYPES = [
  "last_pick",
  "counter_pick",
  "ban_priority",
  "first_phase_bans",
] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export function isChallengeType(value: unknown): value is ChallengeType {
  return typeof value === "string" && (CHALLENGE_TYPES as readonly string[]).includes(value);
}

export interface ChallengeInfo {
  type: ChallengeType;
  title: string;
  summary: string;
  /** What the player does, e.g. "Pick your 5th hero". */
  task: string;
}

export const CHALLENGE_INFO: Record<ChallengeType, ChallengeInfo> = {
  last_pick: {
    type: "last_pick",
    title: "Last pick",
    summary:
      "Your team has four heroes and the enemy has all five. Find the hero that completes your lineup and answers theirs.",
    task: "Pick your 5th hero",
  },
  counter_pick: {
    type: "counter_pick",
    title: "Counter pick",
    summary:
      "The enemy has shown one to three heroes. Pick the best answer to them that still fits the role your team is missing.",
    task: "Pick a counter",
  },
  ban_priority: {
    type: "ban_priority",
    title: "Ban priority",
    summary:
      "Your team has two or three heroes. Ban the hero that would hurt them most, or that fills the gap in the enemy lineup.",
    task: "Choose one ban",
  },
  first_phase_bans: {
    type: "first_phase_bans",
    title: "Opening bans",
    summary:
      "The first ban phase of a Captain's Mode game. The other captain has banned two heroes; choose your two bans for the current meta.",
    task: "Choose two bans",
  },
};

/** Seeds are short, URL-safe tokens. */
export const SEED_PATTERN = /^[a-z0-9]{4,24}$/;

export function isValidSeed(seed: unknown): seed is string {
  return typeof seed === "string" && SEED_PATTERN.test(seed);
}

/** A new random seed (callers pass a random source; tests pass a fixed one). */
export function newSeed(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 8; i++)
    out += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return out;
}

/** FNV-1a hash of a string to 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for shuffling a hero pool. */
export function seededRandom(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export interface Puzzle {
  type: ChallengeType;
  seed: string;
  action: "pick" | "ban";
  /** How many heroes the answer names (2 for opening bans). */
  answerCount: 1 | 2;
  yourPicks: number[];
  enemyPicks: number[];
  /** Heroes already banned (by either team), in ban order. */
  bans: number[];
  yourPicksLeft: number;
  enemyPicksLeft: number;
}

export type PuzzleError =
  { type: "invalid_type" } | { type: "invalid_seed" } | { type: "not_enough_heroes" };

/** Smallest catalog a puzzle can be built from (9 picks, 14 bans and a real choice left). */
export const MIN_POOL = 30;

/**
 * Role order for a lineup: 3 cores and 2 supports in a seeded order. Taking the first k
 * slots never gives more than 3 cores or 2 supports, so partial lineups stay sensible.
 */
function roleOrder(random: () => number): LineupRole[] {
  return shuffle<LineupRole>(
    [
      ...Array<LineupRole>(CORE_SLOTS).fill("core"),
      ...Array<LineupRole>(SUPPORT_SLOTS).fill("support"),
    ],
    random,
  );
}

/**
 * Generate the puzzle for `{type, seed}` from the catalog. Deterministic: the catalog is
 * sorted by id first, so the order it arrives in doesn't matter.
 */
export function generatePuzzle(
  type: string,
  seed: string,
  catalog: readonly ScoringHero[],
): Result<Puzzle, PuzzleError> {
  if (!isChallengeType(type)) return err({ type: "invalid_type" });
  if (!isValidSeed(seed)) return err({ type: "invalid_seed" });
  const heroes = [...catalog].sort((a, b) => a.id - b.id);
  const cores = heroes.filter((h) => lineupRole(h) === "core");
  const supports = heroes.filter((h) => lineupRole(h) === "support");
  if (heroes.length < MIN_POOL || cores.length < 8 || supports.length < 5) {
    return err({ type: "not_enough_heroes" });
  }

  const random = seededRandom(`${type}:${seed}`);
  const taken = new Set<number>();
  const coreDeck = shuffle(cores, random);
  const supportDeck = shuffle(supports, random);
  const draw = (role: LineupRole): number => {
    const deck = role === "core" ? coreDeck : supportDeck;
    const hero = deck.find((h) => !taken.has(h.id));
    // MIN_POOL and the role minimums above guarantee a hero is left.
    if (!hero) throw new Error("hero pool exhausted");
    taken.add(hero.id);
    return hero.id;
  };
  const lineup = (size: number) => roleOrder(random).slice(0, size).map(draw);
  const banHeroes = (count: number) =>
    shuffle(
      heroes.filter((h) => !taken.has(h.id)),
      random,
    )
      .slice(0, count)
      .map((h) => {
        taken.add(h.id);
        return h.id;
      });

  switch (type) {
    case "last_pick": {
      // Captain's Mode last pick: every ban is done, 9 heroes are on the board.
      const enemyPicks = lineup(5);
      const yourPicks = lineup(4);
      return ok({
        type,
        seed,
        action: "pick",
        answerCount: 1,
        yourPicks,
        enemyPicks,
        bans: banHeroes(14),
        yourPicksLeft: 1,
        enemyPicksLeft: 0,
      });
    }
    case "counter_pick": {
      const enemyCount = between(random, 1, 3);
      // Mid-draft: you have about as many heroes as the enemy (never a full lineup).
      const yourCount = between(random, Math.max(1, enemyCount - 1), Math.min(3, enemyCount + 1));
      const enemyPicks = lineup(enemyCount);
      const yourPicks = lineup(yourCount);
      return ok({
        type,
        seed,
        action: "pick",
        answerCount: 1,
        yourPicks,
        enemyPicks,
        bans: banHeroes(enemyCount + yourCount >= 4 ? 10 : 7),
        yourPicksLeft: 5 - yourCount,
        enemyPicksLeft: 5 - enemyCount,
      });
    }
    case "ban_priority": {
      const yourCount = between(random, 2, 3);
      const enemyCount = between(random, yourCount - 1, yourCount);
      const yourPicks = lineup(yourCount);
      const enemyPicks = lineup(enemyCount);
      return ok({
        type,
        seed,
        action: "ban",
        answerCount: 1,
        yourPicks,
        enemyPicks,
        bans: banHeroes(yourCount + enemyCount >= 5 ? 10 : 7),
        yourPicksLeft: 5 - yourCount,
        enemyPicksLeft: 5 - enemyCount,
      });
    }
    case "first_phase_bans":
      // cm-2026 ban phase 1 is F F S S F S S: the first-pick captain has banned twice,
      // and you (second pick) now ban twice.
      return ok({
        type,
        seed,
        action: "ban",
        answerCount: 2,
        yourPicks: [],
        enemyPicks: [],
        bans: banHeroes(2),
        yourPicksLeft: 5,
        enemyPicksLeft: 5,
      });
  }
}

/** Heroes still choosable in a puzzle (catalog order by id). */
export function availableIds(puzzle: Puzzle, catalog: readonly ScoringHero[]): number[] {
  const taken = new Set([...puzzle.yourPicks, ...puzzle.enemyPicks, ...puzzle.bans]);
  return catalog
    .map((h) => h.id)
    .filter((id) => !taken.has(id))
    .sort((a, b) => a - b);
}

export type AnswerError =
  | { type: "wrong_count"; expected: number }
  | { type: "duplicate" }
  | { type: "unavailable"; heroId: number };

/** The referee: an answer must name the right number of distinct, still-available heroes. */
export function validateAnswer(
  puzzle: Puzzle,
  catalog: readonly ScoringHero[],
  answer: readonly number[],
): Result<number[], AnswerError> {
  if (answer.length !== puzzle.answerCount) {
    return err({ type: "wrong_count", expected: puzzle.answerCount });
  }
  if (new Set(answer).size !== answer.length) return err({ type: "duplicate" });
  const available = new Set(availableIds(puzzle, catalog));
  const bad = answer.find((id) => !available.has(id));
  if (bad !== undefined) return err({ type: "unavailable", heroId: bad });
  return ok([...answer]);
}

export type Grade = "excellent" | "good" | "playable" | "risky";

export const GRADE_LABEL: Record<Grade, string> = {
  excellent: "Excellent",
  good: "Good",
  playable: "Playable",
  risky: "Risky",
};

const GRADE_ORDER: Grade[] = ["excellent", "good", "playable", "risky"];

/** Rank bands: top 3, top 10, bottom quarter (outside the top 10), everything else. */
export function gradeForRank(rank: number, total: number): Grade {
  if (rank <= 3) return "excellent";
  if (rank <= 10) return "good";
  const bottomBand = Math.max(3, Math.ceil(total * 0.25));
  return rank > total - bottomBand ? "risky" : "playable";
}

export interface GradedChoice {
  heroId: number;
  name: string;
  grade: Grade;
  /** 1-based position among the legal options; null when it breaks lineup rules or no data. */
  rank: number | null;
  /** How many legal options were ranked. */
  total: number;
  fitsLineup: boolean;
  /** Plain-language reason for the grade. */
  verdict: string;
  facts: string[];
}

export interface Alternative {
  heroId: number;
  name: string;
  role: LineupRole;
  facts: string[];
}

export interface ChallengeResult {
  grade: Grade;
  choices: GradedChoice[];
  /** Top 3 by the numbers (empty when grading by role fit only). */
  best: Alternative[];
  basis: "stats" | "role_fit";
  notice: string | null;
  disclaimer: string;
}

export const GRADE_DISCLAIMER =
  "Based on high-rank win rates and head-to-head matchups; drafting also depends on lanes and players.";

export const ROLE_FIT_NOTICE =
  "Public hero stats are unavailable right now, so this grade only checks whether your choice fits the lineups. Try again later for a full grade.";

export interface ChallengeData {
  meta: ReadonlyMap<number, HeroMeta>;
  /** Matchup tables for heroes on the board (by hero id). */
  matchups: ReadonlyMap<number, MatchupTable>;
}

/** Heroes whose matchup tables grading needs: the enemy's for picks, yours for bans. */
export function matchupHeroes(puzzle: Puzzle): number[] {
  return puzzle.action === "pick" ? puzzle.enemyPicks : puzzle.yourPicks;
}

function needsText(
  team: readonly ScoringHero[],
  picksLeft: number,
  who: "Your team" | "The enemy",
) {
  const needs = lineupNeeds(team, picksLeft);
  if (needs.mustPickSupport) return `${who} needs a support`;
  if (needs.mustPickCore) return `${who} needs a core`;
  return null;
}

/**
 * Grade an already-validated answer. `answer` must come from `validateAnswer`.
 */
export function gradeAnswer(
  puzzle: Puzzle,
  catalog: readonly ScoringHero[],
  answer: readonly number[],
  data: ChallengeData,
): ChallengeResult {
  const byId = new Map(catalog.map((h) => [h.id, h]));
  const heroes = (ids: readonly number[]) =>
    ids.map((id) => byId.get(id)).filter((h): h is ScoringHero => !!h);
  const own = heroes(puzzle.yourPicks);
  const enemy = heroes(puzzle.enemyPicks);
  const available = heroes(availableIds(puzzle, catalog));
  const base = {
    action: puzzle.action,
    own,
    enemy,
    ownPicksLeft: puzzle.yourPicksLeft,
    enemyPicksLeft: puzzle.enemyPicksLeft,
  };
  const hasStats = data.meta.size > 0 || data.matchups.size > 0;

  // Every legal option, best first (picks that break lineup rules are left out).
  const ranked = rankCandidates({
    ...base,
    available,
    meta: data.meta,
    matchups: data.matchups,
    limit: available.length,
  });
  const position = new Map(ranked.map((c, i) => [c.heroId, i + 1]));

  // What the team that "needs" something is short of, for plain-language verdicts.
  const needLine =
    puzzle.action === "pick"
      ? needsText(own, puzzle.yourPicksLeft, "Your team")
      : needsText(enemy, puzzle.enemyPicksLeft, "The enemy");
  const enemyNeeds = lineupNeeds(enemy, puzzle.enemyPicksLeft);

  const choices = answer.map((id): GradedChoice => {
    const hero = byId.get(id)!;
    const rank = position.get(id) ?? null;
    // Evidence for this hero alone: an empty own lineup never filters it out.
    const [solo] = rankCandidates({
      ...base,
      own: puzzle.action === "pick" ? [] : own,
      ownPicksLeft: puzzle.action === "pick" ? 5 : puzzle.yourPicksLeft,
      available: [hero],
      meta: data.meta,
      matchups: data.matchups,
      limit: 1,
    });
    const facts = solo?.facts ?? [];
    const common = { heroId: id, name: hero.name, facts, total: ranked.length };

    if (puzzle.action === "pick" && rank === null) {
      return {
        ...common,
        grade: "risky",
        rank: null,
        fitsLineup: false,
        verdict: `${hero.name} plays as ${lineupRole(hero)}, but ${(needLine ?? "your team needs another role").toLowerCase()}: this breaks the lineup.`,
      };
    }

    if (!hasStats) {
      // Role-fit fallback: no numbers, so only judge the lineup.
      if (puzzle.action === "pick") {
        const primaryFit =
          !needLine ||
          (needLine.endsWith("support")
            ? lineupRole(hero) === "support"
            : lineupRole(hero) === "core");
        return {
          ...common,
          grade: primaryFit ? "good" : "playable",
          rank: null,
          fitsLineup: true,
          verdict: primaryFit
            ? `${hero.name} fits the role your team needs.`
            : `${hero.name} can fill the role, but it isn't their main one.`,
        };
      }
      const deniesNeed =
        (enemyNeeds.mustPickSupport && canSupport(hero)) ||
        (enemyNeeds.mustPickCore && lineupRole(hero) === "core");
      return {
        ...common,
        grade: deniesNeed ? "good" : "playable",
        rank: null,
        fitsLineup: true,
        verdict: deniesNeed
          ? `${hero.name} fills the role the enemy still needs.`
          : `Without stats we can't say how much banning ${hero.name} protects your lineup.`,
      };
    }

    const grade = gradeForRank(rank!, ranked.length);
    const place = `#${rank} of ${ranked.length} ${puzzle.action === "pick" ? "heroes that fit" : "possible bans"} by the numbers`;
    const verdict =
      grade === "excellent"
        ? `One of the strongest choices here (${place}).`
        : grade === "good"
          ? `A solid choice (${place}).`
          : grade === "playable"
            ? `Playable, but there are clearly stronger options (${place}).`
            : `Near the bottom of the options (${place}).`;
    return { ...common, grade, rank, fitsLineup: true, verdict };
  });

  const grade = choices.reduce<Grade>(
    (worst, c) => (GRADE_ORDER.indexOf(c.grade) > GRADE_ORDER.indexOf(worst) ? c.grade : worst),
    "excellent",
  );
  const best: Alternative[] = hasStats
    ? ranked.slice(0, 3).map((c: Candidate) => ({
        heroId: c.heroId,
        name: c.name,
        role: c.role,
        facts: c.facts,
      }))
    : [];
  return {
    grade,
    choices,
    best,
    basis: hasStats ? "stats" : "role_fit",
    notice: hasStats ? null : ROLE_FIT_NOTICE,
    disclaimer: GRADE_DISCLAIMER,
  };
}

/** Plain-language summary of what each side needs, shown with the position. */
export function describePosition(puzzle: Puzzle, catalog: readonly ScoringHero[]): string {
  const byId = new Map(catalog.map((h) => [h.id, h]));
  const team = (ids: readonly number[]) =>
    ids.map((id) => byId.get(id)).filter((h): h is ScoringHero => !!h);
  const own = team(puzzle.yourPicks);
  const needs = lineupNeeds(own, puzzle.yourPicksLeft);
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (puzzle.type) {
    case "first_phase_bans":
      return "No heroes are picked yet. Ban the heroes that are strongest in the current meta.";
    case "ban_priority":
      return `Your team has ${count(needs.cores, "core")} and ${count(needs.supports, "support")}. Ban what threatens them most, or what the enemy still needs.`;
    default: {
      const role = needs.mustPickSupport
        ? "You need a support."
        : needs.mustPickCore
          ? "You need a core."
          : "Any role still fits.";
      return `Your team has ${count(needs.cores, "core")} and ${count(needs.supports, "support")}. ${role}`;
    }
  }
}
