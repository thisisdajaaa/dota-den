/**
 * Draft outlook (pure): an estimate of which side the draft favours, with its evidence.
 *
 * This is deliberately a simple, explainable model, not a trained predictor:
 * - each hero adds half its current high-rank win rate edge (above/below 50%): part of a
 *   public win rate is who plays the hero, not the hero itself;
 * - each hero's average head-to-head advantage over the other side adds a quarter of itself
 *   (the other side's disadvantage is the mirror image, so the gap counts about half);
 * - each same-team pair adds a quarter of its pro synergy edge, capped at 4 points per side
 *   (pro samples are small, and real pair synergy is worth a few points at most).
 * Positions (carry, mid, offlane, soft and hard support) come from where the pros play
 * each hero; they drive the lineup warnings and the lane-by-lane matchups, which are shown
 * as evidence but not added again to the estimate (they're part of the matchups already).
 * The sum is in percentage points and the estimate is clamped to 30-70%, because the
 * draft alone rarely decides a game. It is always shown as an estimate with its basis.
 */
import {
  assignPositions,
  POSITION_NAMES,
  positionOdds,
  type Position,
  type PositionTable,
} from "./draft-positions";
import { laneRecord, type LaneTable } from "./draft-lanes";
import {
  compositionChecks,
  draftReport,
  type DraftReport,
  type SideEvidence,
} from "./draft-report";
import type { Side } from "./draft-state";
import {
  canSupport,
  contestRate,
  lineupRole,
  matchupAdvantage,
  metaEdge,
  proSource,
  proWinEdge,
  synergyAdvantage,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type ScoringHero,
  type SynergyTable,
} from "./draft-scoring";

export const OUTLOOK_FLOOR = 30;
export const OUTLOOK_CEILING = 70;
const SYNERGY_CAP = 4;

export interface OutlookHero {
  heroId: number;
  name: string;
  side: Side;
  role: "core" | "support";
  /** The position this hero most likely plays in this lineup. */
  position: Position | null;
  /** How often the pros play it there (0..1), or null when only role tags are known. */
  positionShare: number | null;
  /** Public high-rank record, when known. */
  games: number | null;
  winRate: number | null;
  /** Recent pro drafts. */
  proPicks: number | null;
  proBans: number | null;
  proWinRate: number | null;
  contest: number | null;
  /** Best and worst head-to-head vs the other side (advantage in points). */
  bestMatchup: { name: string; edge: number } | null;
  worstMatchup: { name: string; edge: number } | null;
}

export interface SideBreakdown {
  /** Sum of the heroes' win rate edges (points). */
  meta: number;
  /** This side's weighted head-to-head advantage over the other (points). */
  matchups: number;
  /** Same-team pro synergy (points). */
  synergy: number;
  /** Lane results, weighted (points). */
  lanes: number;
  cores: number;
  supports: number;
  /** Positions nobody on this side fills yet. */
  open: Position[];
  /** Plain-language warnings about the lineup, e.g. "4 cores and no support". */
  warnings: string[];
}

export interface LaneMatchup {
  lane: "radiant_safe" | "mid" | "radiant_off";
  /** e.g. "Radiant safe lane vs Dire offlane". */
  label: string;
  radiant: number[];
  dire: number[];
  /** Radiant's edge in this lane (points); null without data. */
  edge: number | null;
  /** "pro_lanes": pro lane results (gold at 10 minutes); "matchups": whole-game head-to-heads. */
  source: "pro_lanes" | "matchups" | null;
  /** Pro lanes behind a "pro_lanes" edge, and how many Radiant's heroes won. */
  games: number;
  wins: number;
}

export interface DraftOutlook {
  /** Estimated Radiant win chance in percent, or null before any hero is picked. */
  radiantPct: number | null;
  /** "low" with few picks or thin data; never "high": the draft is only part of a game. */
  confidence: "low" | "medium";
  /** How many cross-team pairings had enough head-to-head data (0..1). */
  coverage: number;
  sides: Record<Side, SideBreakdown>;
  heroes: OutlookHero[];
  /** Who meets whom in each lane, once both sides have heroes there. */
  lanes: LaneMatchup[];
  /** Whether positions come from pro games (else from hero role tags). */
  positionsFrom: "pro" | "tags";
  /** Plain-language takeaways, strongest first. */
  notes: string[];
  /** Where the tournament numbers come from, e.g. "PGL Wallachia and 6 more tournaments, last 21 days". */
  tournaments: string | null;
  /** The rubric: each side graded on lanes, counters, composition, strength, positions, combos. */
  report: DraftReport;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function lineupWarnings(team: readonly ScoringHero[]): string[] {
  const supports = team.filter((h) => lineupRole(h) === "support").length;
  const cores = team.length - supports;
  const flex = team.filter((h) => lineupRole(h) === "core" && canSupport(h)).length;
  const warnings: string[] = [];
  if (cores > 3 && supports + flex < 2) {
    warnings.push(`${cores} cores and only ${supports} support${supports === 1 ? "" : "s"}`);
  }
  if (supports > 2) warnings.push(`${supports} supports: short on farm-dependent damage`);
  return warnings;
}

export function draftOutlook(input: {
  radiant: readonly ScoringHero[];
  dire: readonly ScoringHero[];
  meta: ReadonlyMap<number, HeroMeta>;
  /** Matchup tables for every picked hero. */
  matchups: ReadonlyMap<number, MatchupTable>;
  pro?: ProMeta;
  synergy?: SynergyTable;
  positions?: PositionTable;
  lanes?: LaneTable;
  /** Positions set by hand, per side (hero id -> position). */
  fixed?: Partial<Record<Side, ReadonlyMap<number, Position>>>;
  /** Picks per side in a complete draft (the report is provisional until then). */
  picksPerSide?: number;
}): DraftOutlook {
  const { radiant, dire, meta, matchups, pro, synergy, positions, fixed } = input;
  const teams: Record<Side, readonly ScoringHero[]> = { radiant, dire };
  const assigned = {
    radiant: assignPositions(radiant, positions, fixed?.radiant),
    dire: assignPositions(dire, positions, fixed?.dire),
  };
  const positionOf = new Map(
    [...assigned.radiant.heroes, ...assigned.dire.heroes].map((h) => [h.heroId, h.position]),
  );
  const other = (s: Side): Side => (s === "radiant" ? "dire" : "radiant");

  // Head-to-heads, from each hero's point of view (read from the opponent's table).
  const h2h = new Map<number, { name: string; edge: number }[]>();
  let pairs = 0;
  let covered = 0;
  for (const side of ["radiant", "dire"] as const) {
    for (const hero of teams[side]) {
      const rows: { name: string; edge: number }[] = [];
      for (const foe of teams[other(side)]) {
        if (side === "radiant") pairs++;
        const edge = matchupAdvantage(hero.id, foe.id, matchups.get(foe.id), meta);
        if (edge === null) continue;
        if (side === "radiant") covered++;
        rows.push({ name: foe.name, edge });
      }
      h2h.set(hero.id, rows);
    }
  }

  const lanes = laneMatchups(teams, positionOf, matchups, meta, input.lanes);
  // Lanes count for about a third of their edge: laning is only the first ten minutes.
  const laneTotal = sum(lanes.map((l) => (l.source === "pro_lanes" ? (l.edge ?? 0) : 0))) * 0.3;

  const breakdown = (side: Side): SideBreakdown => {
    const team = teams[side];
    const matchupSum = sum(
      team.map((h) => {
        const rows = h2h.get(h.id) ?? [];
        return rows.length ? sum(rows.map((r) => r.edge)) / rows.length : 0;
      }),
    );
    let synergySum = 0;
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        synergySum += (synergyAdvantage(team[i].id, team[j].id, synergy, meta, pro)?.edge ?? 0) / 4;
      }
    }
    const supports = positions
      ? assigned[side].heroes.filter((h) => h.position >= 4).length
      : team.filter((h) => lineupRole(h) === "support").length;
    return {
      meta: round1(sum(team.map((h) => metaEdge(meta.get(h.id)))) / 2),
      matchups: round1(matchupSum / 4),
      synergy: round1(Math.max(-SYNERGY_CAP, Math.min(SYNERGY_CAP, synergySum))),
      lanes: round1(side === "radiant" ? laneTotal / 2 : -laneTotal / 2),
      cores: team.length - supports,
      supports,
      open: assigned[side].open,
      warnings: positions
        ? positionWarnings(team, assigned[side].heroes, positions)
        : lineupWarnings(team),
    };
  };
  const sides = { radiant: breakdown("radiant"), dire: breakdown("dire") };

  const heroes: OutlookHero[] = (["radiant", "dire"] as const).flatMap((side) =>
    teams[side].map((h): OutlookHero => {
      const rec = meta.get(h.id);
      const stat = pro?.heroes.get(h.id);
      const rows = [...(h2h.get(h.id) ?? [])].sort((a, b) => b.edge - a.edge);
      return {
        heroId: h.id,
        name: h.name,
        side,
        role: positionOf.has(h.id)
          ? positionOf.get(h.id)! >= 4
            ? "support"
            : "core"
          : lineupRole(h),
        position: positionOf.get(h.id) ?? null,
        positionShare: (() => {
          const odds = positionOdds(h, positions);
          const p = positionOf.get(h.id);
          return odds.source === "pro" && odds.proShare && p ? odds.proShare[p - 1] : null;
        })(),
        games: rec && rec.games > 0 ? rec.games : null,
        winRate: rec && rec.games > 0 ? rec.wins / rec.games : null,
        proPicks: stat ? stat.picks : pro ? 0 : null,
        proBans: stat ? stat.bans : pro ? 0 : null,
        proWinRate: stat && stat.picks > 0 ? stat.wins / stat.picks : null,
        contest: pro ? contestRate(stat, pro) : null,
        bestMatchup: rows[0] && rows[0].edge > 0 ? rows[0] : null,
        worstMatchup: rows.at(-1) && rows.at(-1)!.edge < 0 ? rows.at(-1)! : null,
      };
    }),
  );

  const coverage = pairs ? covered / pairs : 0;
  const picked = radiant.length + dire.length;
  const edge = (s: SideBreakdown) => s.meta + s.matchups + s.synergy + s.lanes;
  const diff = edge(sides.radiant) - edge(sides.dire);
  const radiantPct =
    picked === 0 ? null : Math.round(Math.min(OUTLOOK_CEILING, Math.max(OUTLOOK_FLOOR, 50 + diff)));
  const confidence =
    radiant.length >= 4 && dire.length >= 4 && coverage >= 0.5 && meta.size > 0 ? "medium" : "low";

  const evidence = (side: Side): SideEvidence => {
    const team = teams[side];
    const sign = side === "radiant" ? 1 : -1;
    const withData = lanes.filter((l) => l.edge !== null);
    const counterRows = team
      .map((h) => h2h.get(h.id) ?? [])
      .filter((rows) => rows.length > 0)
      .map((rows) => sum(rows.map((r) => r.edge)) / rows.length);
    const strength = team
      .filter((h) => meta.get(h.id)?.games)
      .map((h) => metaEdge(meta.get(h.id)) + proWinEdge(pro?.heroes.get(h.id)) * 0.3);
    const combos: number[] = [];
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = synergyAdvantage(team[i].id, team[j].id, synergy, meta, pro);
        if (a) combos.push(a.edge);
      }
    }
    const shares = assigned[side].heroes.map((slot) => {
      const hero = team.find((h) => h.id === slot.heroId)!;
      const odds = positionOdds(hero, positions);
      return {
        hero,
        slot,
        share: odds.source === "pro" && odds.proShare ? odds.proShare[slot.position - 1] : null,
      };
    });
    const known = shares.filter((x) => x.share !== null);
    const carry = shares.find((x) => x.slot.position === 1)?.hero ?? null;
    return {
      heroes: team.length,
      laneEdge: withData.length
        ? (sum(withData.map((l) => l.edge!)) / withData.length) * sign
        : null,
      lanesWithData: withData.length,
      proLanes: withData.filter((l) => l.source === "pro_lanes").length,
      counterEdge: counterRows.length ? sum(counterRows) / counterRows.length : null,
      strengthEdge: strength.length ? sum(strength) / strength.length : null,
      positionFit: known.length
        ? Math.exp(sum(known.map((x) => Math.log(Math.max(x.share!, 0.01)))) / known.length)
        : null,
      offRole: known
        .filter((x) => x.share! < 0.1)
        .map((x) => `${x.hero.name} at ${POSITION_NAMES[x.slot.position]}`),
      comboEdge: combos.length ? sum(combos) / combos.length : null,
      comboPairs: combos.length,
      composition: compositionChecks(team, carry),
    };
  };
  const full = input.picksPerSide ?? 5;
  const report = draftReport(
    evidence("radiant"),
    evidence("dire"),
    radiant.length >= full && dire.length >= full,
  );
  return {
    radiantPct,
    confidence,
    coverage,
    sides,
    heroes,
    lanes,
    positionsFrom: positions ? "pro" : "tags",
    notes: [...outlookNotes(sides, heroes, pro), ...laneNotes(lanes, heroes)],
    tournaments: pro ? proSource(pro) : null,
    report,
  };
}

const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

/** A hero pushed off its usual positions: "Juggernaut would have to play Offlane (2% of ...)". */
function positionWarnings(
  team: readonly ScoringHero[],
  lineup: readonly { heroId: number; position: Position; fit: number }[],
  positions: PositionTable,
): string[] {
  const warnings: string[] = [];
  for (const slot of lineup) {
    const hero = team.find((h) => h.id === slot.heroId);
    if (!hero) continue;
    const odds = positionOdds(hero, positions);
    if (odds.source !== "pro" || !odds.proShare) continue;
    const share = odds.proShare[slot.position - 1];
    if (share < 0.1) {
      warnings.push(
        `${hero.name} would have to play ${POSITION_NAMES[slot.position]} (pros play it there in ${Math.round(share * 100)}% of ${odds.games} games)`,
      );
    }
  }
  return warnings;
}

const LANES: { lane: LaneMatchup["lane"]; label: string; radiant: Position[]; dire: Position[] }[] =
  [
    {
      lane: "radiant_safe",
      label: "Radiant safe lane vs Dire offlane",
      radiant: [1, 5],
      dire: [3, 4],
    },
    { lane: "mid", label: "Mid lane", radiant: [2], dire: [2] },
    {
      lane: "radiant_off",
      label: "Radiant offlane vs Dire safe lane",
      radiant: [3, 4],
      dire: [1, 5],
    },
  ];

function laneMatchups(
  teams: Record<Side, readonly ScoringHero[]>,
  positionOf: ReadonlyMap<number, Position>,
  matchups: ReadonlyMap<number, MatchupTable>,
  meta: ReadonlyMap<number, HeroMeta>,
  laneTable: LaneTable | undefined,
): LaneMatchup[] {
  const at = (side: Side, ps: Position[]) =>
    teams[side].filter((h) => ps.includes(positionOf.get(h.id)!)).map((h) => h.id);
  return LANES.flatMap(({ lane, label, radiant, dire }): LaneMatchup[] => {
    const r = at("radiant", radiant);
    const d = at("dire", dire);
    if (!r.length || !d.length) return [];
    // Pro lane results first (gold at 10 minutes), pooled over every pairing in the lane.
    let games = 0;
    let wins = 0;
    for (const a of r) {
      for (const b of d) {
        const rec = laneRecord(a, b, laneTable);
        if (rec) {
          games += rec.games;
          wins += rec.wins;
        }
      }
    }
    if (games >= 6) {
      const edge = round1(((wins - games / 2) / (games + 10)) * 100);
      return [
        { lane, label, radiant: r, dire: d, edge, source: "pro_lanes" as const, games, wins },
      ];
    }
    // Otherwise fall back to whole-game head-to-heads of the heroes in that lane.
    const edges: number[] = [];
    for (const a of r) {
      for (const b of d) {
        const e = matchupAdvantage(a, b, matchups.get(b), meta);
        if (e !== null) edges.push(e);
      }
    }
    return [
      {
        lane,
        label,
        radiant: r,
        dire: d,
        edge: edges.length ? round1(sum(edges) / edges.length) : null,
        source: edges.length ? ("matchups" as const) : null,
        games: 0,
        wins: 0,
      },
    ];
  });
}

function outlookNotes(
  sides: Record<Side, SideBreakdown>,
  heroes: readonly OutlookHero[],
  pro: ProMeta | undefined,
): string[] {
  const notes: { weight: number; text: string }[] = [];
  const md = sides.radiant.meta - sides.dire.meta;
  if (Math.abs(md) >= 1) {
    notes.push({
      weight: Math.abs(md),
      text: `${sideName(md > 0 ? "radiant" : "dire")} has the stronger heroes this patch (${Math.abs(md).toFixed(1)} points of win rate).`,
    });
  }
  const mu = sides.radiant.matchups - sides.dire.matchups;
  if (Math.abs(mu) >= 1) {
    notes.push({
      weight: Math.abs(mu),
      text: `${sideName(mu > 0 ? "radiant" : "dire")} wins the head-to-head matchups (${Math.abs(mu).toFixed(1)} points).`,
    });
  }
  const best = [...heroes]
    .filter((h) => h.bestMatchup && h.bestMatchup.edge >= 3)
    .sort((a, b) => b.bestMatchup!.edge - a.bestMatchup!.edge)[0];
  if (best?.bestMatchup) {
    notes.push({
      weight: best.bestMatchup.edge / 2,
      text: `${best.name} is a strong answer to ${best.bestMatchup.name} (+${best.bestMatchup.edge.toFixed(1)} points).`,
    });
  }
  if (pro) {
    const hot = [...heroes]
      .filter((h) => (h.contest ?? 0) >= 0.4)
      .sort((a, b) => (b.contest ?? 0) - (a.contest ?? 0))[0];
    if (hot) {
      notes.push({
        weight: 1,
        text: `${hot.name} is a tournament priority: picked or banned in ${Math.round((hot.contest ?? 0) * 100)}% of recent pro drafts.`,
      });
    }
  }
  for (const side of ["radiant", "dire"] as const) {
    for (const w of sides[side].warnings) {
      notes.push({ weight: 3, text: `${sideName(side)}: ${w}.` });
    }
  }
  return notes.sort((a, b) => b.weight - a.weight).map((n) => n.text);
}

/** "Mid lane favours Radiant: Lina vs Ember Spirit (+3.1 points)." Only clear edges. */
function laneNotes(lanes: readonly LaneMatchup[], heroes: readonly OutlookHero[]): string[] {
  const name = (id: number) => heroes.find((h) => h.heroId === id)?.name ?? `Hero ${id}`;
  return lanes
    .filter((l) => l.edge !== null && Math.abs(l.edge) >= 2)
    .sort((a, b) => Math.abs(b.edge!) - Math.abs(a.edge!))
    .map((l) => {
      const who = l.edge! > 0 ? "Radiant" : "Dire";
      const matchup = `${l.radiant.map(name).join(" + ")} vs ${l.dire.map(name).join(" + ")}`;
      const lane = l.lane === "mid" ? "Mid lane" : l.label;
      return `${lane} favours ${who}: ${matchup} (${Math.abs(l.edge!).toFixed(1)} points).`;
    });
}
