/**
 * Stack planner (pure): tonight's lineup for the members who are in. Every suggestion comes
 * from real games only:
 *
 * - each member's own games in the window, placed in positions 1–5 from parsed-replay lane
 *   data (the Meta page's rule, `positionForGame`); games that can't be placed are skipped;
 * - the stack's confirmed party games (the Together rule: same party id, party size ≥ 2).
 *   Sharing a team without party data is unknown: counted apart, never as together or solo.
 *
 * The optimiser tries every way to give the members different positions (at most 5! = 120)
 * and keeps the one with the highest total score. A member's score at a position is their win
 * rate there pulled toward 50% by SHRINK_GAMES games (party games with this stack count
 * twice), plus a small bonus for how often they play it. A position needs MIN_POSITION_RECORD
 * decided games before its win rate counts; until then (or for a member with fewer than
 * THIN_PLAYER_GAMES placed games) only how often they play it counts, below any real record.
 * Two members whose positions won together at least MIN_COMBO_GAMES times get the pair's
 * damped edge added; a pair that lost clearly is listed as "avoid".
 */
import {
  POSITIONS,
  positionForGame,
  type LaneGame,
  type Position,
} from "@/modules/meta/domain/position";
import type { PairClassification } from "@/modules/together/domain/pair";
import { groupParties, type GroupParty } from "./group-stats";

/** Games from the last this many days (the same window as "who plays what"). */
export const PLANNER_WINDOW_DAYS = 30;
export const MIN_STACK = 2;
export const MAX_STACK = 5;
/** Win rates are pulled toward 50% by this many games. */
export const SHRINK_GAMES = 10;
/** Decided games at a position before its win rate is used. */
export const MIN_POSITION_RECORD = 3;
/** Placed games in the window before a member's records are used at all. */
export const THIN_PLAYER_GAMES = 5;
/** Below this many games at a position, its record is flagged as a small sample. */
export const SMALL_SAMPLE_GAMES = 10;
/** Weight of "how often they play it" (share of their placed games, 0–1). */
export const FAMILIARITY_WEIGHT = 0.1;
/** Base score of a position without a usable record: below any real record's score. */
export const UNFAMILIAR_SCORE = 0.3;
/** Decided party games before a pair's positions count for or against a lineup. */
export const MIN_COMBO_GAMES = 3;
/** "Avoid" needs at least this many decided party games… */
export const AVOID_MIN_GAMES = 4;
/** …won at most this share of the time. */
export const AVOID_MAX_RATE = 0.3;
/** Hero options per member. */
export const HERO_OPTIONS = 3;

export interface Tally {
  games: number;
  /** Games whose result is known. */
  decided: number;
  wins: number;
}

const empty = (): Tally => ({ games: 0, decided: 0, wins: 0 });

function add(t: Tally, result: "win" | "loss" | null | undefined) {
  t.games++;
  if (result === "win" || result === "loss") t.decided++;
  if (result === "win") t.wins++;
}

/** Win rate pulled toward 50% by SHRINK_GAMES games. */
export function damped(wins: number, decided: number): number {
  return (wins + SHRINK_GAMES * 0.5) / (decided + SHRINK_GAMES);
}

export interface PlannerMember {
  accountId32: number;
  /** Their recent games with lane info; null when they couldn't be read. */
  games: readonly LaneGame[] | null;
}

export interface PlannerInput {
  /** The members who are in tonight (2 to 5). */
  members: readonly PlannerMember[];
  /** Who is planning; "together with you" is shown when they're in. */
  viewer: number | null;
  /** Cached pair classifications among the members (the Together feature). */
  partyRows: readonly PairClassification[];
  rolesOf: (heroId: number) => readonly string[] | undefined;
  now: Date;
  windowDays?: number;
}

/**
 * - `record`: their own record at this position (and with this stack) decided it.
 * - `most_played`: too few placed games for records: their most played position.
 * - `leftover`: no usable record here, the positions they play were taken.
 * - `no_data`: none of their recent games could be placed in a position.
 */
export type SlotBasis = "record" | "most_played" | "leftover" | "no_data";

export interface HeroOption extends Tally {
  heroId: number;
}

export interface PlannedSlot {
  accountId32: number;
  position: Position;
  basis: SlotBasis;
  /** Their own games at this position in the window. */
  own: Tally;
  /** Their games in the window: all, and those placed in a position. */
  total: number;
  placed: number;
  /** Positions they played in the window, most games first. */
  mostPlayed: Position[];
  /** Confirmed party games with others in tonight's stack, at this position. */
  together: Tally;
  /** Confirmed party games with the viewer (any position); null for the viewer or when out. */
  withYou: Tally | null;
  smallSample: boolean;
  /** Heroes they played at this position, most games first. */
  heroes: HeroOption[];
}

export interface PositionCombo {
  a: { accountId32: number; position: Position };
  b: { accountId32: number; position: Position };
  decided: number;
  wins: number;
}

export interface StackPlan {
  windowDays: number;
  /** One per member, by position. */
  slots: PlannedSlot[];
  /** Confirmed party games in the window with two or more of tonight's members. */
  together: Tally;
  /** Party games with exactly tonight's members. */
  exact: Tally;
  /** Party games in the window where tonight's party couldn't be placed in positions. */
  togetherUnplaced: number;
  /** Same-team games without party data: not counted as together, nor as solo. */
  unknownGames: number;
  /** Pairs in the lineup whose positions won together (MIN_COMBO_GAMES+). */
  worked: PositionCombo[];
  /** Pairs whose positions clearly lost together (AVOID_MIN_GAMES+, ≤ AVOID_MAX_RATE). */
  avoid: PositionCombo[];
  /** Members whose games couldn't be read right now. */
  unavailable: number[];
  /** Some member's suggestion isn't backed by a record (thin data). */
  thin: boolean;
}

interface Profile {
  accountId32: number;
  total: number;
  placed: number;
  byPosition: Record<Position, Tally & { heroes: Map<number, Tally> }>;
  positionOf: Map<string, Position>;
}

function profileOf(m: PlannerMember, input: PlannerInput, since: number): Profile {
  const byPosition = Object.fromEntries(
    POSITIONS.map((p) => [p, { ...empty(), heroes: new Map<number, Tally>() }]),
  ) as Profile["byPosition"];
  const positionOf = new Map<string, Position>();
  let total = 0;
  let placed = 0;
  for (const g of m.games ?? []) {
    // Only games we know are in the window.
    if (g.startTime === undefined || g.startTime * 1000 < since) continue;
    total++;
    const pos = positionForGame(g, input.rolesOf(g.heroId));
    if (pos === null) continue;
    placed++;
    add(byPosition[pos], g.result);
    const hero = byPosition[pos].heroes.get(g.heroId) ?? empty();
    add(hero, g.result);
    byPosition[pos].heroes.set(g.heroId, hero);
    if (g.matchId) positionOf.set(g.matchId, pos);
  }
  return { accountId32: m.accountId32, total, placed, byPosition, positionOf };
}

const comboKey = (a: number, pa: Position, b: number, pb: Position) =>
  a < b ? `${a}:${pa}|${b}:${pb}` : `${b}:${pb}|${a}:${pa}`;

function toCombo(key: string, t: Tally): PositionCombo {
  const [x, y] = key.split("|").map((s) => s.split(":").map(Number));
  return {
    a: { accountId32: x[0], position: x[1] as Position },
    b: { accountId32: y[0], position: y[1] as Position },
    decided: t.decided,
    wins: t.wins,
  };
}

/** Every way to give `k` members different positions, in lexicographic order. */
function* assignments(k: number, used: Position[] = []): Generator<Position[]> {
  if (used.length === k) {
    yield [...used];
    return;
  }
  for (const p of POSITIONS) {
    if (used.includes(p)) continue;
    used.push(p);
    yield* assignments(k, used);
    used.pop();
  }
}

export function planStack(input: PlannerInput): StackPlan {
  const windowDays = input.windowDays ?? PLANNER_WINDOW_DAYS;
  const ids = [...new Set(input.members.map((m) => m.accountId32))].sort((a, b) => a - b);
  if (ids.length < MIN_STACK || ids.length > MAX_STACK)
    throw new RangeError(`A stack plan needs ${MIN_STACK} to ${MAX_STACK} members`);
  const since = input.now.getTime() - windowDays * 86_400_000;
  const byId = new Map(input.members.map((m) => [m.accountId32, m]));
  const profiles = new Map(ids.map((id) => [id, profileOf(byId.get(id)!, input, since)]));

  // Confirmed parties in the window, among tonight's members only.
  const rows = input.partyRows.filter((r) => r.startedAt.getTime() >= since);
  const { parties, unknownGames } = groupParties(rows, ids);

  const together = new Map(ids.map((id) => [id, POSITIONS.map(() => empty())]));
  const withYou = new Map(ids.map((id) => [id, empty()]));
  const combos = new Map<string, Tally>();
  const stack = empty();
  const exact = empty();
  let togetherUnplaced = 0;
  const viewerIn = input.viewer !== null && ids.includes(input.viewer);
  for (const party of parties) {
    add(stack, party.result);
    if (party.members.length === ids.length) add(exact, party.result);
    const placed = placedMembers(party, profiles);
    if (placed.length < party.members.length) togetherUnplaced++;
    for (const { id, pos } of placed) add(together.get(id)![pos - 1], party.result);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const key = comboKey(placed[i].id, placed[i].pos, placed[j].id, placed[j].pos);
        const t = combos.get(key) ?? empty();
        add(t, party.result);
        combos.set(key, t);
      }
    if (viewerIn && party.members.includes(input.viewer!))
      for (const id of party.members) if (id !== input.viewer) add(withYou.get(id)!, party.result);
  }

  const score = (id: number, p: Position): number => {
    const prof = profiles.get(id)!;
    const own = prof.byPosition[p];
    const share = prof.placed > 0 ? own.games / prof.placed : 0;
    if (prof.placed >= THIN_PLAYER_GAMES && own.decided >= MIN_POSITION_RECORD) {
      const t = together.get(id)![p - 1];
      return damped(own.wins + t.wins, own.decided + t.decided) + FAMILIARITY_WEIGHT * share;
    }
    return UNFAMILIAR_SCORE + FAMILIARITY_WEIGHT * share;
  };
  const pairEdge = (a: number, pa: Position, b: number, pb: Position): number => {
    const t = combos.get(comboKey(a, pa, b, pb));
    return t && t.decided >= MIN_COMBO_GAMES ? damped(t.wins, t.decided) - 0.5 : 0;
  };

  let best: Position[] = [];
  let bestScore = -Infinity;
  for (const positions of assignments(ids.length)) {
    let total = 0;
    for (let i = 0; i < ids.length; i++) {
      total += score(ids[i], positions[i]);
      for (let j = i + 1; j < ids.length; j++)
        total += pairEdge(ids[i], positions[i], ids[j], positions[j]);
    }
    // Strictly better only: ties keep the first (lowest positions for lower account ids).
    if (total > bestScore + 1e-9) {
      bestScore = total;
      best = positions;
    }
  }

  const slots = ids
    .map((id, i): PlannedSlot => {
      const prof = profiles.get(id)!;
      const p = best[i];
      const own = prof.byPosition[p];
      const basis: SlotBasis =
        prof.placed === 0
          ? "no_data"
          : prof.placed >= THIN_PLAYER_GAMES && own.decided >= MIN_POSITION_RECORD
            ? "record"
            : prof.placed < THIN_PLAYER_GAMES && own.games > 0
              ? "most_played"
              : "leftover";
      return {
        accountId32: id,
        position: p,
        basis,
        own: { games: own.games, decided: own.decided, wins: own.wins },
        total: prof.total,
        placed: prof.placed,
        mostPlayed: POSITIONS.filter((q) => prof.byPosition[q].games > 0).sort(
          (a, b) => prof.byPosition[b].games - prof.byPosition[a].games || a - b,
        ),
        together: together.get(id)![p - 1],
        withYou: viewerIn && id !== input.viewer ? withYou.get(id)! : null,
        smallSample: own.decided < SMALL_SAMPLE_GAMES,
        heroes: [...own.heroes.entries()]
          .map(([heroId, t]) => ({ heroId, ...t }))
          .sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)
          .slice(0, HERO_OPTIONS),
      };
    })
    .sort((a, b) => a.position - b.position);

  const inLineup = new Set(slots.map((s) => `${s.accountId32}:${s.position}`));
  const all = [...combos.entries()].map(([k, t]) => toCombo(k, t));
  const worked = all
    .filter(
      (c) =>
        c.decided >= MIN_COMBO_GAMES &&
        c.wins * 2 > c.decided &&
        inLineup.has(`${c.a.accountId32}:${c.a.position}`) &&
        inLineup.has(`${c.b.accountId32}:${c.b.position}`),
    )
    .sort((x, y) => damped(y.wins, y.decided) - damped(x.wins, x.decided));
  const avoid = all
    .filter((c) => c.decided >= AVOID_MIN_GAMES && c.wins <= AVOID_MAX_RATE * c.decided)
    .sort((x, y) => x.wins / x.decided - y.wins / y.decided || y.decided - x.decided)
    .slice(0, 2);

  return {
    windowDays,
    slots,
    together: stack,
    exact,
    togetherUnplaced,
    unknownGames,
    worked,
    avoid,
    unavailable: ids.filter((id) => byId.get(id)!.games === null),
    thin: slots.some((s) => s.basis !== "record"),
  };
}

/** The party's members whose position in that match is known. */
function placedMembers(
  party: GroupParty,
  profiles: Map<number, Profile>,
): Array<{ id: number; pos: Position }> {
  return party.members.flatMap((id) => {
    const pos = profiles.get(id)?.positionOf.get(party.matchId);
    return pos ? [{ id, pos }] : [];
  });
}
