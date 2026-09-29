/**
 * Data-grounded candidate ranking for the AI captain (pure).
 *
 * The language model only chooses among these candidates and explains its choice, so the
 * draft is anchored in real numbers instead of the model's memory:
 * - meta: the hero's current public win rate at high ranks, shrunk toward 50% on small samples;
 * - matchup: head-to-head win rates against heroes already picked;
 * - lineup rules: teams need cores and supports, so a 4th core or a 3rd support is excluded.
 */

export interface ScoringHero {
  id: number;
  name: string;
  /** OpenDota role tags; the first one is treated as the primary role. */
  roles: readonly string[];
}

export interface HeroMeta {
  games: number;
  wins: number;
}

/** Head-to-head record of a hero against others: opponentId -> {games, wins}. */
export type MatchupTable = ReadonlyMap<number, { games: number; wins: number }>;

export type LineupRole = "core" | "support";

/** Primary role decides whether a hero occupies a core or a support slot. */
export function lineupRole(hero: ScoringHero): LineupRole {
  return hero.roles[0] === "Support" ? "support" : "core";
}

export function canSupport(hero: ScoringHero): boolean {
  return hero.roles.includes("Support");
}

export const CORE_SLOTS = 3;
export const SUPPORT_SLOTS = 2;
const MIN_MATCHUP_GAMES = 40;
/** Pseudo-games toward 50%: small samples barely move the score. */
const SHRINK_GAMES = 500;

export interface LineupNeeds {
  cores: number;
  supports: number;
  picksLeft: number;
  /** Remaining picks must all be supports (or at least this one). */
  mustPickSupport: boolean;
  /** Supports are full; only cores fit. */
  mustPickCore: boolean;
}

export function lineupNeeds(team: readonly ScoringHero[], picksLeft: number): LineupNeeds {
  const supports = team.filter((h) => lineupRole(h) === "support").length;
  const cores = team.length - supports;
  const supportsMissing = Math.max(0, SUPPORT_SLOTS - supports);
  return {
    cores,
    supports,
    picksLeft,
    mustPickSupport: cores >= CORE_SLOTS || (picksLeft > 0 && picksLeft <= supportsMissing),
    mustPickCore: supports >= SUPPORT_SLOTS && cores < CORE_SLOTS,
  };
}

function fits(hero: ScoringHero, needs: LineupNeeds): boolean {
  if (needs.mustPickSupport) return canSupport(hero);
  if (needs.mustPickCore) return lineupRole(hero) === "core";
  return true;
}

/** Win rate in percentage points above/below 50, shrunk toward 0 on small samples. */
function metaEdge(meta: HeroMeta | undefined): number {
  if (!meta || meta.games <= 0) return 0;
  return ((meta.wins - meta.games / 2) / (meta.games + SHRINK_GAMES)) * 100;
}

/**
 * Candidate's win rate vs `opponent`, from the opponent's matchup table (whose "wins" are
 * the opponent's wins against the candidate). Null when the sample is too small.
 */
function vsEdge(candidateId: number, opponentTable: MatchupTable | undefined): number | null {
  const rec = opponentTable?.get(candidateId);
  if (!rec || rec.games < MIN_MATCHUP_GAMES) return null;
  return (0.5 - rec.wins / rec.games) * 100;
}

export interface Candidate {
  heroId: number;
  name: string;
  role: LineupRole;
  score: number;
  metaEdge: number;
  matchupEdge: number | null;
  /** Human-readable evidence the model sees and cites. */
  facts: string[];
}

const pct = (edge: number) => `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}`;

export function rankCandidates(input: {
  action: "pick" | "ban";
  available: readonly ScoringHero[];
  /** The AI's own picks and the opponent's picks. */
  own: readonly ScoringHero[];
  enemy: readonly ScoringHero[];
  ownPicksLeft: number;
  enemyPicksLeft: number;
  meta: ReadonlyMap<number, HeroMeta>;
  /** Matchup tables for heroes already picked (by hero id). */
  matchups: ReadonlyMap<number, MatchupTable>;
  limit?: number;
}): Candidate[] {
  const { action, available, own, enemy, meta, matchups } = input;
  const ownNeeds = lineupNeeds(own, input.ownPicksLeft);
  const enemyNeeds = lineupNeeds(enemy, input.enemyPicksLeft);

  // Picks: good against the enemy's heroes and fit our lineup.
  // Bans: good against OUR heroes and fit the enemy's lineup (deny what they'd want).
  const opponents = action === "pick" ? enemy : own;
  const needs = action === "pick" ? ownNeeds : enemyNeeds;
  const pool = action === "pick" ? available.filter((h) => fits(h, ownNeeds)) : available;

  const scored = pool.map((hero): Candidate => {
    const m = metaEdge(meta.get(hero.id));
    const edges = opponents
      .map((o) => ({ o, e: vsEdge(hero.id, matchups.get(o.id)) }))
      .filter((x): x is { o: ScoringHero; e: number } => x.e !== null);
    const matchupEdge = edges.length ? edges.reduce((a, x) => a + x.e, 0) / edges.length : null;
    const needBonus = fits(hero, needs) && (needs.mustPickSupport || needs.mustPickCore) ? 1.5 : 0;
    const score = m + (matchupEdge ?? 0) * 1.5 + needBonus;

    const facts: string[] = [];
    const rec = meta.get(hero.id);
    if (rec && rec.games > 0) {
      facts.push(
        `${((rec.wins / rec.games) * 100).toFixed(1)}% win rate at high ranks (${rec.games.toLocaleString("en-US")} games)`,
      );
    }
    const strongest = [...edges].sort((a, b) => Math.abs(b.e) - Math.abs(a.e)).slice(0, 3);
    if (strongest.length) {
      const target = action === "pick" ? "vs opponent's" : "vs our";
      facts.push(`${target} ${strongest.map((x) => `${x.o.name} ${pct(x.e)}%`).join(", ")}`);
    }
    facts.push(
      `plays as ${lineupRole(hero)}${canSupport(hero) && lineupRole(hero) === "core" ? " (can support)" : ""}`,
    );
    return {
      heroId: hero.id,
      name: hero.name,
      role: lineupRole(hero),
      score,
      metaEdge: m,
      matchupEdge,
      facts,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.heroId - b.heroId)
    .slice(0, input.limit ?? 12);
}
