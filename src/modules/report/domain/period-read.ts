/**
 * The AI read of a battle report period (pure): the facts the model is given, and the check
 * its answer must pass. The model writes the words; every number it uses must be one of these
 * facts (the coach's grounding rule), and each point cites the facts it's based on.
 */
import { clock, ungroundedIn, type GroundFact } from "@/common/utils/grounding";
import { avgOf, type BattleReport, type PeriodTotals } from "./battle-report";

/** The interface languages a read can be written in. */
export type ReadLocale = "en" | "fil" | "ceb";

/** Bump when the facts or the prompt change: stored reads are kept per version. */
export const PERIOD_READ_VERSION = "period-read-v1";
/** Fewer games than this and there's nothing worth reading into. */
export const MIN_READ_GAMES = 5;
/** Heroes listed by name (most played). */
const TOP_HEROES = 5;
/** Lane roles are only described with this many games that have lane data. */
const MIN_ROLE_GAMES = 5;

export interface PeriodFacts {
  facts: GroundFact[];
  /** Games in the period (a new game makes a new read possible). */
  games: number;
}

const pct = (wins: number, games: number) => Math.round((wins / games) * 100);
const round1 = (n: number) => Math.round(n * 10) / 10;
const ROLE = { 1: "safe lane", 2: "mid", 3: "off lane", 4: "jungle" } as const;

/** The period as facts, for the prompt and the check. Null when there are too few games. */
export function periodFacts(
  input: {
    report: BattleReport;
    current: PeriodTotals;
    previous: PeriodTotals;
    /** Only an exact MMR change: an estimate is never given to the model as a fact. */
    mmrExact: number | null;
  },
  heroName: (heroId: number) => string,
): PeriodFacts | null {
  const { report: r, current, previous } = input;
  if (r.games < MIN_READ_GAMES) return null;
  const facts: GroundFact[] = [];
  const add = (key: string, label: string, value: number | string, unit: GroundFact["unit"]) =>
    facts.push({ key, label, value, unit });

  add("games", "Games played", r.games, "count");
  add("wins", "Wins", r.wins, "count");
  add("losses", "Losses", r.games - r.wins, "count");
  add("winRate", "Win rate, %", pct(r.wins, r.games), "percent");
  add("heroesPlayed", "Different heroes played", r.heroesPlayed, "count");
  add("longestWinStreak", "Longest win streak", r.maxWinStreak, "count");
  add("longestLossStreak", "Longest loss streak", r.maxLossStreak, "count");
  if (r.avgDurationSec !== null)
    add("avgDuration", "Average game length", Math.round(r.avgDurationSec), "clock");
  for (const side of ["radiant", "dire"] as const) {
    const s = r.sides[side];
    if (s.games === 0) continue;
    add(`${side}Games`, `Games on ${side}`, s.games, "count");
    add(`${side}WinRate`, `Win rate on ${side}, %`, pct(s.wins, s.games), "percent");
  }
  if (current.kda !== null)
    add("kda", "KDA ((kills + assists) / deaths)", round1(current.kda), "ratio");
  if (current.gpm !== null)
    add("gpm", "Average gold per minute", Math.round(current.gpm), "number");
  if (input.mmrExact !== null)
    add("mmrChange", "MMR change (from your MMR journal)", input.mmrExact, "number");

  if (previous.games > 0) {
    add("prevGames", "Games in the period before", previous.games, "count");
    if (previous.winRate !== null)
      add(
        "prevWinRate",
        "Win rate in the period before, %",
        Math.round(previous.winRate * 100),
        "percent",
      );
    if (previous.kda !== null)
      add("prevKda", "KDA in the period before", round1(previous.kda), "ratio");
    if (previous.gpm !== null)
      add("prevGpm", "Gold per minute in the period before", Math.round(previous.gpm), "number");
  }

  const heroes = [...r.heroes]
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, TOP_HEROES);
  heroes.forEach((h, i) => {
    const name = heroName(h.heroId);
    const k = `hero${i + 1}`;
    add(`${k}.name`, `Hero ${i + 1} by games`, name, "text");
    add(`${k}.games`, `${name}: games`, h.games, "count");
    add(`${k}.winRate`, `${name}: win rate, %`, pct(h.wins, h.games), "percent");
    add(`${k}.kda`, `${name}: KDA`, round1((h.kills + h.assists) / Math.max(1, h.deaths)), "ratio");
    const gpm = avgOf(h.gpm);
    if (gpm !== null)
      add(`${k}.gpm`, `${name}: average gold per minute`, Math.round(gpm), "number");
  });

  if (r.roles.withData >= MIN_ROLE_GAMES) {
    for (const role of r.roles.byRole) {
      if (role.games === 0) continue;
      const label = ROLE[role.role as keyof typeof ROLE] ?? `role ${role.role}`;
      add(
        `role${role.role}.games`,
        `Games in the ${label} (replays with lane data)`,
        role.games,
        "count",
      );
      add(
        `role${role.role}.winRate`,
        `Win rate in the ${label}, %`,
        pct(role.wins, role.games),
        "percent",
      );
    }
  }
  return { facts, games: r.games };
}

/** A fact as the prompt shows it: "key | label: value". */
export function factLine(f: GroundFact): string {
  const value =
    typeof f.value === "string"
      ? f.value
      : f.unit === "clock"
        ? clock(f.value)
        : f.unit === "percent"
          ? `${f.value}%`
          : String(f.value);
  return `${f.key} | ${f.label}: ${value}`;
}

export type ReadKind = "strength" | "improve" | "focus";

export interface ReadPoint {
  kind: ReadKind;
  title: string;
  detail: string;
  factKeys: string[];
}

/**
 * The model's points, checked: 3–5 of them, exactly one "focus", each citing known facts,
 * and no number the facts don't back. The problems found otherwise (sent back on a retry).
 */
export function checkReadPoints(
  points: readonly ReadPoint[],
  facts: readonly GroundFact[],
): { ok: true; value: ReadPoint[] } | { ok: false; error: string[] } {
  const keys = new Set(facts.map((f) => f.key));
  const problems: string[] = [];
  if (points.length < 3 || points.length > 5) problems.push("Write 3 to 5 points.");
  if (points.filter((p) => p.kind === "focus").length !== 1)
    problems.push('Exactly one point must be the "focus" for next time.');
  points.forEach((p, i) => {
    const cited = p.factKeys.filter((k) => keys.has(k));
    if (cited.length === 0) problems.push(`Point ${i + 1} cites no fact from FACTS.`);
    const loose = ungroundedIn(`${p.title} ${p.detail}`, facts);
    if (loose.length)
      problems.push(`Point ${i + 1} uses numbers that are not in FACTS: ${loose.join(", ")}.`);
  });
  return problems.length
    ? { ok: false, error: problems }
    : {
        ok: true,
        value: points.map((p) => ({ ...p, factKeys: p.factKeys.filter((k) => keys.has(k)) })),
      };
}
