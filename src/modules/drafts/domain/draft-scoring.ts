/**
 * Data-grounded candidate ranking for the AI captain (pure).
 *
 * The language model only chooses among these candidates and explains its choice, so the
 * draft is anchored in real numbers instead of the model's memory:
 * - meta: the hero's current public win rate at high ranks, shrunk toward 50% on small samples;
 * - matchup: head-to-head win rates against heroes already picked, measured against what the
 *   two heroes' overall win rates would predict (so a strong hero isn't counted twice);
 * - tournaments: how often recent pro drafts pick or ban the hero, and how it does there;
 * - synergy: how pro teams do with the hero next to heroes already on the same side;
 * - lineup rules: teams need cores and supports, so a 4th core or a 3rd support is excluded.
 */

import { laneRecord, opposingPositions, type LaneTable } from "./draft-lanes";
import {
  assignPositions,
  candidatePosition,
  isSupportPosition,
  MIN_POSITION_FIT,
  POSITION_NAMES,
  positionFact,
  positionOdds,
  type Position,
  type PositionTable,
} from "./draft-positions";

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

/** One hero in recent professional drafts. `wins` counts games won when picked. */
export interface ProHeroStat {
  picks: number;
  bans: number;
  wins: number;
}

/** Recent tournament drafts (professional matches with a pick/ban phase). */
export interface ProMeta {
  /** Drafts in the window. */
  matches: number;
  days: number;
  /** Leagues in the window, most matches first. */
  leagues: readonly { name: string; matches: number }[];
  heroes: ReadonlyMap<number, ProHeroStat>;
}

/** Same-team records of hero pairs in pro matches, keyed by `pairKey`. */
export type SynergyTable = ReadonlyMap<string, { games: number; wins: number }>;

export const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

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
export const MIN_MATCHUP_GAMES = 40;
/** Pseudo-games toward 50%: small samples barely move the score. */
const SHRINK_GAMES = 500;
/** Pro samples are small: fewer pseudo-games, but still damped. */
const PRO_SHRINK_GAMES = 20;
/** Pairs are picked because they did well, so small records regress hard: damp them a lot. */
const SYNERGY_SHRINK_GAMES = 60;
/** Head-to-head samples are small too: a 200-game record keeps about 60% of its edge. */
const MATCHUP_SHRINK_GAMES = 130;
/** A pair needs this many pro games together before it counts. */
export const MIN_SYNERGY_GAMES = 6;

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
export function metaEdge(meta: HeroMeta | undefined): number {
  if (!meta || meta.games <= 0) return 0;
  return ((meta.wins - meta.games / 2) / (meta.games + SHRINK_GAMES)) * 100;
}

/**
 * How much better `candidate` does against `opponent` than their overall win rates predict,
 * in percentage points. Read from the opponent's matchup table (whose "wins" are the
 * opponent's wins against the candidate), shrunk toward 0 on small samples. Null when the
 * sample is too small to use at all.
 */
export function matchupAdvantage(
  candidateId: number,
  opponentId: number,
  opponentTable: MatchupTable | undefined,
  meta: ReadonlyMap<number, HeroMeta>,
): number | null {
  const rec = opponentTable?.get(candidateId);
  if (!rec || rec.games < MIN_MATCHUP_GAMES) return null;
  const expected = (metaEdge(meta.get(candidateId)) - metaEdge(meta.get(opponentId))) / 100;
  const raw = (0.5 - rec.wins / rec.games - expected) * 100;
  return (raw * rec.games) / (rec.games + MATCHUP_SHRINK_GAMES);
}

/**
 * How much better two heroes do together in pro matches than each does on its own, in
 * percentage points, shrunk toward 0. "On its own" is the hero's pro win rate when there is
 * tournament data (a pair of heroes that simply win a lot in pro games isn't synergy),
 * otherwise its public win rate. Null when they rarely play together.
 */
export function synergyAdvantage(
  a: number,
  b: number,
  synergy: SynergyTable | undefined,
  meta: ReadonlyMap<number, HeroMeta>,
  pro?: ProMeta,
): { edge: number; games: number; winRate: number } | null {
  const rec = synergy?.get(pairKey(a, b));
  if (!rec || rec.games < MIN_SYNERGY_GAMES) return null;
  const solo = (id: number) => (pro ? proWinEdge(pro.heroes.get(id)) : metaEdge(meta.get(id)));
  const expected = rec.games * (0.5 + (solo(a) + solo(b)) / 100);
  return {
    edge: ((rec.wins - expected) / (rec.games + SYNERGY_SHRINK_GAMES)) * 100,
    games: rec.games,
    winRate: rec.wins / rec.games,
  };
}

/** Share of recent pro drafts that picked or banned the hero (0..1). */
export function contestRate(stat: ProHeroStat | undefined, pro: ProMeta | undefined): number {
  if (!stat || !pro || pro.matches <= 0) return 0;
  return Math.min(1, (stat.picks + stat.bans) / pro.matches);
}

/** Pro win rate edge when picked, in percentage points, shrunk toward 0. */
export function proWinEdge(stat: ProHeroStat | undefined): number {
  if (!stat || stat.picks <= 0) return 0;
  return ((stat.wins - stat.picks / 2) / (stat.picks + PRO_SHRINK_GAMES)) * 100;
}

/** "PGL Wallachia and 6 more tournaments": where the pro numbers come from. */
export function proSource(pro: ProMeta): string {
  const [top, ...rest] = pro.leagues;
  const where = top
    ? rest.length
      ? `${top.name.trim()} and ${rest.length} more tournament${rest.length === 1 ? "" : "s"}`
      : top.name.trim()
    : "pro matches";
  return `${where}, last ${pro.days} days`;
}

export interface Candidate {
  heroId: number;
  name: string;
  role: LineupRole;
  score: number;
  metaEdge: number;
  matchupEdge: number | null;
  /** Share of recent pro drafts that picked or banned the hero (0..1). */
  contest: number;
  /** Average pro synergy edge with the relevant side's heroes; null without data. */
  synergyEdge: number | null;
  /** The position this hero would take in the lineup it joins (ours for picks, theirs for bans). */
  position: Position | null;
  /** How naturally it fills that slot, 0..1 (1 = nobody has to move off their usual role). */
  positionFit: number | null;
  /** Average pro lane edge against the heroes it would lane against (points); null without data. */
  laneEdge: number | null;
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
  pro?: ProMeta;
  synergy?: SynergyTable;
  /** Where heroes are played in pro games; without it, role tags estimate positions. */
  positions?: PositionTable;
  /** Pro laning records: who wins the lane against whom. */
  lanes?: LaneTable;
  /** Positions the player set by hand (hero id -> position), per lineup. */
  fixed?: { own?: ReadonlyMap<number, Position>; enemy?: ReadonlyMap<number, Position> };
  limit?: number;
}): Candidate[] {
  const { action, available, own, enemy, meta, matchups, pro, synergy, positions, lanes } = input;
  const fixedOwn = input.fixed?.own;
  const fixedEnemy = input.fixed?.enemy;
  const ownNeeds = lineupNeeds(own, input.ownPicksLeft);
  const enemyNeeds = lineupNeeds(enemy, input.enemyPicksLeft);

  // Picks: good against the enemy's heroes and fit our lineup.
  // Bans: good against OUR heroes and fit the enemy's lineup (deny what they'd want).
  const opponents = action === "pick" ? enemy : own;
  // Synergy: picks pair with our heroes; bans deny heroes that pair with theirs.
  const partners = action === "pick" ? own : enemy;
  const needs = action === "pick" ? ownNeeds : enemyNeeds;
  // The lineup the hero would join: ours for picks, theirs for bans.
  const lineup = action === "pick" ? own : enemy;
  const lineupFixed = action === "pick" ? fixedOwn : fixedEnemy;
  const slotOf = new Map(
    available.map((h) => [h.id, candidatePosition(h, lineup, positions, lineupFixed)]),
  );
  const fitsPosition = (h: ScoringHero) => {
    const slot = slotOf.get(h.id);
    if (!slot) return false;
    // With pro position data, trust it; with only role tags (a guess), use the simpler
    // core/support rule instead.
    const known = positionOdds(h, positions).source === "pro";
    return known ? slot.lineupFit >= MIN_POSITION_FIT : fits(h, ownNeeds);
  };
  const pool = action === "pick" ? available.filter(fitsPosition) : available;
  // Who the candidate would lane against: the other lineup's heroes in the opposing lane.
  const rivals = action === "pick" ? enemy : own;
  const rivalAt = new Map(
    assignPositions(rivals, positions, action === "pick" ? fixedEnemy : fixedOwn).heroes.map(
      (h) => [h.position, h.heroId] as const,
    ),
  );
  const rivalById = new Map(rivals.map((h) => [h.id, h]));

  const scored = pool.map((hero): Candidate => {
    const m = metaEdge(meta.get(hero.id));
    const edges = opponents
      .map((o) => ({ o, e: matchupAdvantage(hero.id, o.id, matchups.get(o.id), meta) }))
      .filter((x): x is { o: ScoringHero; e: number } => x.e !== null);
    const matchupEdge = edges.length ? edges.reduce((a, x) => a + x.e, 0) / edges.length : null;
    const pairs = partners
      .map((p) => ({ p, s: synergyAdvantage(hero.id, p.id, synergy, meta, pro) }))
      .filter((x): x is { p: ScoringHero; s: NonNullable<typeof x.s> } => x.s !== null);
    const synergyEdge = pairs.length
      ? pairs.reduce((a, x) => a + x.s.edge, 0) / pairs.length
      : null;
    const proStat = pro?.heroes.get(hero.id);
    const contest = contestRate(proStat, pro);
    // Heroes the pros fight over are strong this patch; they matter most as bans.
    const proScore = contest * (action === "ban" ? 5 : 2.5) + proWinEdge(proStat) * 0.3;
    const needBonus = fits(hero, needs) && (needs.mustPickSupport || needs.mustPickCore) ? 1.5 : 0;
    const slot = slotOf.get(hero.id) ?? null;
    const laneRows = slot
      ? opposingPositions(slot.position)
          .map((p) => rivalById.get(rivalAt.get(p) ?? -1))
          .filter((f): f is ScoringHero => !!f)
          .map((f) => ({ f, r: laneRecord(hero.id, f.id, lanes) }))
          .filter((x): x is { f: ScoringHero; r: NonNullable<typeof x.r> } => x.r !== null)
      : [];
    const laneEdge = laneRows.length
      ? laneRows.reduce((a, x) => a + x.r.edge, 0) / laneRows.length
      : null;
    // Picks: fill an open position naturally. Bans: deny what fits their open positions.
    const positionScore = slot ? slot.lineupFit * (action === "pick" ? 2 : 1.5) : 0;
    const score =
      m +
      (matchupEdge ?? 0) * 1.5 +
      (synergyEdge ?? 0) * 0.8 +
      proScore +
      needBonus +
      positionScore +
      (laneEdge ?? 0) * 1.2;

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
    if (pro && proStat && contest >= 0.1) {
      const won = proStat.picks >= 5 ? ` (won ${proStat.wins} of ${proStat.picks})` : "";
      facts.push(`picked or banned in ${Math.round(contest * 100)}% of recent pro drafts${won}`);
    }
    const bestPair = [...pairs].sort((a, b) => b.s.edge - a.s.edge)[0];
    if (bestPair && Math.abs(bestPair.s.edge) >= 1) {
      const whose = action === "pick" ? "with our" : "with their";
      facts.push(
        `${whose} ${bestPair.p.name}: ${Math.round(bestPair.s.winRate * 100)}% win rate together in ${bestPair.s.games} pro games`,
      );
    }
    const lane = [...laneRows].sort((a, b) => Math.abs(b.r.edge) - Math.abs(a.r.edge))[0];
    if (lane && Math.abs(lane.r.edge) >= 2) {
      const whose = action === "pick" ? "their" : "our";
      facts.push(
        `in lane vs ${whose} ${lane.f.name}: won ${lane.r.wins} of ${lane.r.games} pro lanes`,
      );
    }
    if (slot) {
      const fact = positionFact(slot.position, positionOdds(hero, positions));
      facts.push(
        action === "pick" ? fact : `would fill their ${POSITION_NAMES[slot.position]} (${fact})`,
      );
    } else {
      facts.push(
        `plays as ${lineupRole(hero)}${canSupport(hero) && lineupRole(hero) === "core" ? " (can support)" : ""}`,
      );
    }
    return {
      heroId: hero.id,
      name: hero.name,
      role: slot ? (isSupportPosition(slot.position) ? "support" : "core") : lineupRole(hero),
      position: slot?.position ?? null,
      positionFit: slot?.lineupFit ?? null,
      laneEdge,
      score,
      metaEdge: m,
      matchupEdge,
      contest,
      synergyEdge,
      facts,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.heroId - b.heroId)
    .slice(0, input.limit ?? 12);
}
