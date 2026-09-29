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
 * The sum is in percentage points and the estimate is clamped to 30-70%, because the
 * draft alone rarely decides a game. It is always shown as an estimate with its basis.
 */
import type { Side } from "./draft-state";
import {
  canSupport,
  contestRate,
  lineupRole,
  matchupAdvantage,
  metaEdge,
  proSource,
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
  cores: number;
  supports: number;
  /** Plain-language warnings about the lineup, e.g. "4 cores and no support". */
  warnings: string[];
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
  /** Plain-language takeaways, strongest first. */
  notes: string[];
  /** Where the tournament numbers come from, e.g. "PGL Wallachia and 6 more tournaments, last 21 days". */
  tournaments: string | null;
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
}): DraftOutlook {
  const { radiant, dire, meta, matchups, pro, synergy } = input;
  const teams: Record<Side, readonly ScoringHero[]> = { radiant, dire };
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
    const supports = team.filter((h) => lineupRole(h) === "support").length;
    return {
      meta: round1(sum(team.map((h) => metaEdge(meta.get(h.id)))) / 2),
      matchups: round1(matchupSum / 4),
      synergy: round1(Math.max(-SYNERGY_CAP, Math.min(SYNERGY_CAP, synergySum))),
      cores: team.length - supports,
      supports,
      warnings: lineupWarnings(team),
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
        role: lineupRole(h),
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
  const edge = (s: SideBreakdown) => s.meta + s.matchups + s.synergy;
  const diff = edge(sides.radiant) - edge(sides.dire);
  const radiantPct =
    picked === 0 ? null : Math.round(Math.min(OUTLOOK_CEILING, Math.max(OUTLOOK_FLOOR, 50 + diff)));
  const confidence =
    radiant.length >= 4 && dire.length >= 4 && coverage >= 0.5 && meta.size > 0 ? "medium" : "low";

  return {
    radiantPct,
    confidence,
    coverage,
    sides,
    heroes,
    notes: outlookNotes(sides, heroes, pro),
    tournaments: pro ? proSource(pro) : null,
  };
}

const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

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
