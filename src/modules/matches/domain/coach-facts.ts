/**
 * The AI match coach's fact sheet (pure). Everything the coach may talk about is built here
 * from data we already have for one match and one player: nothing is estimated, and anything
 * the match doesn't have is listed as missing instead (CLAUDE.md: never fabricate stats).
 * The model only ever sees this sheet; the UI renders the numbers from it, not from the
 * model's text.
 */
import { clock, ungroundedIn } from "@/common/utils/grounding";
export { clock };
import type { MatchDetail, MatchPlayer } from "./match-detail";
import { laneResult } from "./match-extras";
import { classifyQueue } from "./queue-classification";
import { keyItemTimings, laneOpponents } from "./match-laning";
import { inWindow } from "./match-map";
import { PERF_STATS, type PerfStat } from "./match-performance";
import type { ItemInfo } from "./read-models";

/** Bump when the prompt or the fact sheet changes meaningfully: old reviews stay cached. */
export const COACH_PROMPT_VERSION = "coach-v4";

/** Languages the coach writes in: the interface languages (src/common/i18n/locales.ts). */
export type CoachLocale = "en" | "fil" | "ceb";

/** Items worth a timing: real purchases, not consumables, components or recipes. */
export const KEY_ITEM_MIN_COST = 1_400;
/** Item timings given to the coach (first purchases, in order). */
export const COACH_MAX_ITEMS = 8;

export function isKeyItem(item: Pick<ItemInfo, "key" | "qual" | "cost"> | undefined): boolean {
  return (
    !!item &&
    !item.key.startsWith("recipe_") &&
    item.qual !== "consumable" &&
    (item.cost ?? 0) >= KEY_ITEM_MIN_COST
  );
}

/** What a fact is; the UI labels it from this (plus `subject` for items and opponents). */
export type CoachFactBase =
  | "result"
  | "duration"
  | "patch"
  | "party"
  | "partySize"
  | "kills"
  | "deaths"
  | "assists"
  | "kda"
  | "level"
  | "lastHits"
  | "denies"
  | "gpm"
  | "xpm"
  | "netWorth"
  | "heroDamage"
  | "towerDamage"
  | "heroHealing"
  | "laneRole"
  | "laneEfficiency"
  | "laneResult"
  | "lastHitsAt10"
  | "deniesAt10"
  | "goldAt10"
  | "opponentLastHitsAt10"
  | "opponentGoldAt10"
  | "observers"
  | "sentries"
  | "campsStacked"
  | "stuns"
  | "teamfightParticipation"
  | "teamfightDeaths"
  | "teamfightDeathsLaning"
  | "teamfightDeathsMid"
  | "teamfightDeathsLate"
  | "itemTiming"
  | "benchmark";

/**
 * How a value reads: a count or plain number, a percentage (0–100), seconds (stuns), a game
 * clock in seconds (item timings, duration), a ratio (KDA), or a code (`text`).
 */
export type CoachFactUnit = "count" | "number" | "percent" | "seconds" | "clock" | "ratio" | "text";

export interface CoachFact {
  /** Unique within a sheet; the model cites facts by this key. */
  key: string;
  base: CoachFactBase;
  /** Item name, lane opponent's hero, or benchmark stat (a PerfStat key). */
  subject: string | null;
  value: number | string;
  unit: CoachFactUnit;
}

/** Data the coach doesn't have for this match, so it can say so instead of guessing. */
export type CoachMissing =
  | "patch"
  | "party"
  | "laneRole"
  | "laneOpponents"
  | "laningAt10"
  | "itemTimings"
  | "benchmarks"
  | "teamfightDeaths"
  | "damage"
  | "wards";

export interface CoachFactSheet {
  matchId: string;
  heroId: number;
  heroName: string;
  facts: CoachFact[];
  missing: CoachMissing[];
}

const LANE_ROLES: Record<number, string> = { 1: "safe", 2: "mid", 3: "off", 4: "jungle" };

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/**
 * The fact sheet for `player` in `match`. `items` maps item keys (as in purchase logs) to the
 * catalog; `heroName` names heroes; `patch` is the patch the match was played on, when known.
 */
export function buildCoachFactSheet(input: {
  match: MatchDetail;
  player: MatchPlayer;
  heroName: (heroId: number) => string;
  items: ReadonlyMap<string, Pick<ItemInfo, "key" | "name" | "qual" | "cost">>;
  patch: string | null;
}): CoachFactSheet {
  const { match, player: p, heroName, items, patch } = input;
  const facts: CoachFact[] = [];
  const missing: CoachMissing[] = [];
  const add = (
    base: CoachFactBase,
    value: number | string | null | undefined,
    unit: CoachFactUnit,
    opts: { key?: string; subject?: string | null } = {},
  ) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "number" && !Number.isFinite(value)) return false;
    facts.push({ key: opts.key ?? base, base, subject: opts.subject ?? null, value, unit });
    return true;
  };

  const won = (p.side === "radiant") === match.radiantWin;
  add("result", won ? "win" : "loss", "text");
  add("duration", match.durationSec, "clock");
  if (!add("patch", patch, "text")) missing.push("patch");

  // Party: the app's one rule (classifyQueue). Missing or impossible party data, or a lobby
  // that isn't matchmaking, is unknown, never solo.
  const queue = classifyQueue({ lobbyType: match.lobbyType, partySize: p.partySize });
  if (queue.queueClass === "unknown") {
    add("party", "unknown", "text");
    missing.push("party");
  } else if (queue.queueClass === "solo") {
    add("party", "solo", "text");
  } else {
    add("party", "party", "text");
    add("partySize", queue.partySize, "count");
  }

  add("kills", p.kills, "count");
  add("deaths", p.deaths, "count");
  add("assists", p.assists, "count");
  add("kda", round((p.kills + p.assists) / Math.max(1, p.deaths), 1), "ratio");
  add("level", p.level, "count");
  add("lastHits", p.lastHits, "count");
  add("denies", p.denies, "count");
  add("gpm", p.goldPerMin, "number");
  add("xpm", p.xpPerMin, "number");
  add("netWorth", p.netWorth, "number");
  const damage = [
    add("heroDamage", p.heroDamage, "number"),
    add("towerDamage", p.towerDamage, "number"),
  ];
  if (p.heroHealing !== null && p.heroHealing > 0) add("heroHealing", p.heroHealing, "number");
  if (damage.includes(false)) missing.push("damage");

  const l = p.laning;
  if (l) {
    const role = l.laneRole !== null ? LANE_ROLES[l.laneRole] : undefined;
    if (!add("laneRole", role, "text")) missing.push("laneRole");
    if (l.roaming) add("laneRole", "roaming", "text", { key: "roaming" });
    add("laneEfficiency", l.efficiencyPct === null ? null : round(l.efficiencyPct), "percent");
    const at10 = [
      add("lastHitsAt10", l.lastHitsAt10, "count"),
      add("deniesAt10", l.deniesAt10, "count"),
      add("goldAt10", l.goldAt10, "number"),
    ];
    if (at10.includes(false)) missing.push("laningAt10");

    const opponents = laneOpponents(match.players, p).slice(0, 2);
    if (opponents.length === 0) missing.push("laneOpponents");
    opponents.forEach((o, i) => {
      const subject = heroName(o.heroId);
      add("opponentLastHitsAt10", o.laning?.lastHitsAt10, "count", {
        key: `opponent${i + 1}.lastHitsAt10`,
        subject,
      });
      add("opponentGoldAt10", o.laning?.goldAt10, "number", {
        key: `opponent${i + 1}.goldAt10`,
        subject,
      });
    });
    add("laneResult", laneResult(match.players, p), "text");

    const wards = [add("observers", l.observers, "count"), add("sentries", l.sentries, "count")];
    if (wards.includes(false)) missing.push("wards");
    add("campsStacked", l.campsStacked, "count");
    add("stuns", l.stunsSec === null ? null : round(l.stunsSec, 1), "seconds");
    add(
      "teamfightParticipation",
      l.teamfight === null ? null : round(l.teamfight * 100),
      "percent",
    );

    const timings = keyItemTimings(
      l.purchases,
      (key) => isKeyItem(items.get(key)),
      COACH_MAX_ITEMS,
    );
    if (timings.length === 0) missing.push("itemTimings");
    for (const t of timings) {
      add("itemTiming", Math.round(t.time), "clock", {
        key: `item.${t.key}`,
        subject: items.get(t.key)?.name ?? t.key,
      });
    }
  } else {
    missing.push("laneRole", "laningAt10", "laneOpponents", "itemTimings", "wards");
  }

  if (p.map) {
    const deaths = p.map.teamfightDeaths;
    add("teamfightDeaths", deaths.length, "count");
    add("teamfightDeathsLaning", deaths.filter((d) => inWindow(d.time, "laning")).length, "count");
    add("teamfightDeathsMid", deaths.filter((d) => inWindow(d.time, "mid")).length, "count");
    add("teamfightDeathsLate", deaths.filter((d) => inWindow(d.time, "late")).length, "count");
  } else {
    missing.push("teamfightDeaths");
  }

  let benchmarks = 0;
  for (const stat of PERF_STATS) {
    const b = p.benchmarks?.[stat];
    if (!b || !Number.isFinite(b.pct)) continue;
    if (stat === "hero_healing_per_min" && !(b.raw > 0)) continue;
    const pct = round(Math.min(1, Math.max(0, b.pct)) * 100);
    if (add("benchmark", pct, "percent", { key: `benchmark.${stat}`, subject: stat })) benchmarks++;
  }
  if (benchmarks === 0) missing.push("benchmarks");

  return {
    matchId: match.matchId,
    heroId: p.heroId,
    heroName: heroName(p.heroId),
    facts,
    missing: [...new Set(missing)],
  };
}

const EN_BASE: Record<CoachFactBase, string> = {
  result: "Result",
  duration: "Game length",
  patch: "Patch",
  party: "Queued",
  partySize: "Party size",
  kills: "Kills",
  deaths: "Deaths",
  assists: "Assists",
  kda: "KDA ratio ((kills + assists) / deaths)",
  level: "Level at the end",
  lastHits: "Last hits",
  denies: "Denies",
  gpm: "Gold per minute",
  xpm: "XP per minute",
  netWorth: "Net worth at the end",
  heroDamage: "Hero damage",
  towerDamage: "Tower damage",
  heroHealing: "Hero healing",
  laneRole: "Lane",
  laneEfficiency: "Lane efficiency (share of the lane's possible gold in 10 min), %",
  laneResult: "Lane result by gold at 10 min (with lane partners, vs lane opponents)",
  lastHitsAt10: "Last hits at 10:00",
  deniesAt10: "Denies at 10:00",
  goldAt10: "Gold earned by 10:00",
  opponentLastHitsAt10: "last hits at 10:00 (lane opponent)",
  opponentGoldAt10: "gold earned by 10:00 (lane opponent)",
  observers: "Observer wards placed",
  sentries: "Sentry wards placed",
  campsStacked: "Camps stacked",
  stuns: "Stun duration dealt, seconds",
  teamfightParticipation: "Team fight participation, %",
  teamfightDeaths: "Deaths inside team fights",
  teamfightDeathsLaning: "Team fight deaths 0:00–10:00",
  teamfightDeathsMid: "Team fight deaths 10:00–30:00",
  teamfightDeathsLate: "Team fight deaths after 30:00",
  itemTiming: "bought at (game clock)",
  benchmark: "percentile vs recent games on this hero (higher is better)",
};

const EN_STAT: Record<PerfStat, string> = {
  gold_per_min: "Gold per minute",
  xp_per_min: "XP per minute",
  last_hits_per_min: "Last hits per minute",
  hero_damage_per_min: "Hero damage per minute",
  tower_damage: "Tower damage",
  hero_healing_per_min: "Healing per minute",
};

/** The English label the prompt uses for a fact. */
export function factLabel(f: CoachFact): string {
  if (f.base === "benchmark")
    return `${EN_STAT[f.subject as PerfStat] ?? f.subject} ${EN_BASE.benchmark}`;
  if (f.subject) return `${f.subject} ${EN_BASE[f.base]}`;
  return EN_BASE[f.base];
}

/** A fact's value as the prompt writes it (and as the coach must quote it). */
export function factText(f: CoachFact): string {
  if (typeof f.value === "string") return f.value;
  switch (f.unit) {
    case "clock":
      return clock(f.value);
    case "percent":
      return `${f.value}%`;
    case "seconds":
      return `${f.value}s`;
    default:
      return String(f.value);
  }
}

/**
 * Numbers in `text` that no fact in the sheet backs (empty when the text is grounded): the
 * shared grounding rule (minute markers skipped, clock times exact, other numbers as given,
 * rounded or in thousands), with the facts as the prompt labels them.
 */
export function ungroundedNumbers(text: string, sheet: CoachFactSheet): string[] {
  return ungroundedIn(
    text,
    sheet.facts.map((f) => ({ key: f.key, label: factLabel(f), value: f.value, unit: f.unit })),
  );
}
