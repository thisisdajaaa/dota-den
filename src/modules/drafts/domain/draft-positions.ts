/**
 * The five Dota positions, and which heroes play them (pure).
 *
 * Where a hero is played comes from recent pro matches: within each team and lane, the
 * hero with the most gold per minute is the core (safe lane: pos 1, off lane: pos 3,
 * mid: pos 2) and the others are its supports (safe lane: pos 5, off lane: pos 4).
 * Heroes the pros rarely play fall back to their role tags, and every estimate is
 * blended with that prior so a handful of games can't pin a hero to one position.
 */

export type Position = 1 | 2 | 3 | 4 | 5;
export const POSITIONS: readonly Position[] = [1, 2, 3, 4, 5];

export const POSITION_NAMES: Record<Position, string> = {
  1: "Carry",
  2: "Mid",
  3: "Offlane",
  4: "Soft support",
  5: "Hard support",
};

export const positionLabel = (p: Position) => `Pos ${p} · ${POSITION_NAMES[p]}`;
export const isSupportPosition = (p: Position) => p >= 4;

/** Games at each position (index 0 = pos 1) from pro matches. */
export interface PositionCounts {
  counts: readonly [number, number, number, number, number];
  games: number;
}

export type PositionTable = ReadonlyMap<number, PositionCounts>;

export interface PositionOdds {
  /** Probability of playing each position (index 0 = pos 1); sums to 1. */
  odds: readonly [number, number, number, number, number];
  /** Raw share of pro games at each position, or null without pro games. */
  proShare: readonly number[] | null;
  /** Pro games behind the estimate (0 = role tags only). */
  games: number;
  source: "pro" | "tags";
}

/** Pseudo-games of the role-tag prior mixed into every hero's pro record. */
const PRIOR_GAMES = 8;
/** Below this many pro games the estimate is described as coming from role tags. */
export const MIN_PRO_POSITION_GAMES = 20;
/** A hero "can play" a position when at least this likely to be played there. */
export const MIN_POSITION_FIT = 0.12;

/** Rough positions implied by OpenDota's role tags (only used when pros rarely play it). */
function tagPrior(roles: readonly string[]): [number, number, number, number, number] {
  const w: [number, number, number, number, number] = [0.3, 0.3, 0.3, 0.3, 0.3];
  const add = (pos: Position, x: number) => (w[pos - 1] += x);
  for (const r of roles) {
    switch (r) {
      case "Carry":
        add(1, 3);
        add(2, 1);
        break;
      case "Nuker":
        add(2, 1.5);
        add(4, 1);
        break;
      case "Escape":
        add(2, 1);
        add(1, 0.5);
        add(4, 0.5);
        break;
      case "Initiator":
        add(3, 2);
        add(4, 1);
        break;
      case "Durable":
        add(3, 2);
        add(1, 0.5);
        break;
      case "Disabler":
        add(4, 1);
        add(3, 0.5);
        add(5, 0.5);
        break;
      case "Support":
        add(5, 3);
        add(4, 2);
        break;
      case "Pusher":
        add(3, 0.5);
        add(1, 0.5);
        break;
    }
  }
  // Heroes tagged Support rarely take farm; heroes tagged Carry rarely take pos 5.
  if (roles.includes("Support") && !roles.includes("Carry")) {
    w[0] *= 0.3;
    w[1] *= 0.5;
  }
  if (roles.includes("Carry") && !roles.includes("Support")) w[4] *= 0.3;
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / total) as [number, number, number, number, number];
}

export function positionOdds(
  hero: { id: number; roles: readonly string[] },
  table: PositionTable | undefined,
): PositionOdds {
  const prior = tagPrior(hero.roles);
  const rec = table?.get(hero.id);
  const games = rec?.counts.reduce((a, b) => a + b, 0) ?? 0;
  if (!rec || games === 0) return { odds: prior, proShare: null, games: 0, source: "tags" };
  const odds = rec.counts.map(
    (c, i) => (c + PRIOR_GAMES * prior[i]) / (games + PRIOR_GAMES),
  ) as unknown as PositionOdds["odds"];
  return {
    odds,
    proShare: rec.counts.map((c) => c / games),
    games,
    source: games >= MIN_PRO_POSITION_GAMES ? "pro" : "tags",
  };
}

export interface PositionedHero {
  heroId: number;
  position: Position;
  /** How likely this hero is to be played at this position (0..1). */
  fit: number;
}

export interface Assignment {
  heroes: PositionedHero[];
  /** Positions nobody fills yet, in order. */
  open: Position[];
  /** Product of the fits: how natural the whole lineup is (1 = every hero at home). */
  likelihood: number;
}

/**
 * The most likely way a team's heroes split positions 1-5: every hero gets a different
 * position, maximising the product of their odds. At most 5 heroes, so exhaustive search.
 */
export function assignPositions(
  team: readonly { id: number; roles: readonly string[] }[],
  table: PositionTable | undefined,
  /** Positions the user has set by hand (hero id -> position); the rest are worked out. */
  fixed?: ReadonlyMap<number, Position>,
): Assignment {
  const odds = team.slice(0, 5).map((h) => positionOdds(h, table).odds);
  // Only honour a consistent set of choices: one hero per position.
  const pinned = new Map<number, Position>();
  const taken = new Set<Position>();
  for (const h of team.slice(0, 5)) {
    const p = fixed?.get(h.id);
    if (p && !taken.has(p)) {
      pinned.set(h.id, p);
      taken.add(p);
    }
  }
  let best: { order: Position[]; score: number } = { order: [], score: -Infinity };
  const used = new Set<Position>();
  const order: Position[] = [];
  const walk = (i: number, score: number) => {
    if (i === odds.length) {
      if (score > best.score) best = { order: [...order], score };
      return;
    }
    const pin = pinned.get(team[i].id);
    for (const p of pin ? [pin] : POSITIONS) {
      if (used.has(p) || (!pin && taken.has(p))) continue;
      used.add(p);
      order.push(p);
      walk(i + 1, score + Math.log(Math.max(odds[i][p - 1], 1e-6)));
      order.pop();
      used.delete(p);
    }
  };
  walk(0, 0);
  const heroes = best.order.map((position, i) => ({
    heroId: team[i].id,
    position,
    fit: odds[i][position - 1],
  }));
  return {
    heroes,
    open: POSITIONS.filter((p) => !best.order.includes(p)),
    likelihood: odds.length ? Math.exp(best.score) : 1,
  };
}

/**
 * Where a candidate would play if added to `team`, and how natural that is. The whole
 * lineup is re-assigned, so a flexible hero can push a teammate into a better slot.
 */
export function candidatePosition(
  candidate: { id: number; roles: readonly string[] },
  team: readonly { id: number; roles: readonly string[] }[],
  table: PositionTable | undefined,
  /** Positions the player set by hand for heroes already in the lineup. */
  fixed?: ReadonlyMap<number, Position>,
): { position: Position; fit: number; lineupFit: number } | null {
  if (team.length >= 5) return null;
  const after = assignPositions([...team, candidate], table, fixed);
  const mine = after.heroes.find((h) => h.heroId === candidate.id);
  if (!mine) return null;
  const before = assignPositions(team, table, fixed).likelihood;
  return {
    position: mine.position,
    fit: mine.fit,
    // How much adding this hero keeps the lineup natural (1 = no one displaced).
    lineupFit: before > 0 ? after.likelihood / before : after.likelihood,
  };
}

/** "played Mid in 97% of 272 pro games" or "role tags suggest Mid". */
export function positionFact(position: Position, odds: PositionOdds): string {
  const name = POSITION_NAMES[position];
  if (odds.source === "tags" || !odds.proShare) {
    return `would play ${name} (from hero role tags; few pro games)`;
  }
  const share = Math.round(odds.proShare[position - 1] * 100);
  return `would play ${name}: played there in ${share}% of ${odds.games} pro games`;
}
