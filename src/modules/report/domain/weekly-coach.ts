/**
 * The Monday AI weekly coach (Plus, pure parts): which week a note is about, the facts the
 * model is given, and the check its note must pass before anyone sees it. Like the battle
 * report's AI read, the model writes the words and our data supplies every number (the
 * coach's grounding rule); the note ends with one thing to fix, tied to a real number.
 */
import { addDays, dayKeyFormatter, weekday, type DayKey } from "@/common/time/day-key";
import { clock, ungroundedIn, type GroundFact } from "@/common/utils/grounding";
import { weekStart } from "@/modules/notifications/domain/notification";
import type { BattleReport, PeriodTotals } from "./battle-report";
import { periodFacts, type PeriodFacts } from "./period-read";
import type { ReportRange } from "./report-range";

/**
 * Coach weeks run Monday to Sunday in Philippine time for everyone: the note goes out on
 * Monday morning there (most players), and one schedule serves every player.
 */
export const COACH_TIME_ZONE = "Asia/Manila";
/** Bump when the facts or the prompt change (stored on each note, for troubleshooting). */
export const WEEKLY_COACH_VERSION = "weekly-coach-v1";
/** A week with any game gets a note; small weeks are said to be small, never over-read. */
export const MIN_COACH_GAMES = 1;
/** Below this many games the prompt asks the model to treat the week as a small sample. */
export const SMALL_WEEK_GAMES = 5;

/** The last full Monday–Sunday week in Manila time, as its Monday ("2026-11-09"). */
export function lastCoachWeek(now: Date): DayKey {
  return addDays(weekStart(dayKeyFormatter(COACH_TIME_ZONE)(now)), -7);
}

/** A week key is a valid Monday that has finished by `now` (Manila time). */
export function isFinishedCoachWeek(week: unknown, now: Date): week is DayKey {
  if (typeof week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return false;
  if (addDays(week, 0) !== week || weekday(week) !== 1) return false;
  return week <= lastCoachWeek(now);
}

/** The week as a battle report range (seven days, both ends included). */
export function coachWeekRange(week: DayKey): ReportRange {
  return { from: week, to: addDays(week, 6), length: 7, preset: null };
}

/** A URL range that is exactly one coach week, as its Monday; else null. */
export function coachWeekOf(range: { from: string; to: string }): DayKey | null {
  return weekday(range.from) === 1 && addDays(range.from, 6) === range.to ? range.from : null;
}

/** Only letters, digits and '-': QStash rejects ':' (and more) in deduplication ids. */
const QSTASH_SAFE = /^[A-Za-z0-9-]+$/;
export const isQStashSafe = (key: string) => QSTASH_SAFE.test(key);

/** The per-player job's dedup key: one note job per player and week, whoever queues it. */
export function coachJobKey(userId: string, week: DayKey): string {
  const key = `weekly-coach-${userId}-${week}`;
  if (!isQStashSafe(key)) throw new Error("weekly coach job key must be QStash-safe");
  return key;
}

/** The stored note's id: one note per player and week, written once. */
export const coachNoteId = (userId: string, week: DayKey) => `${userId}-${week}`;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The week as facts: the battle report's facts (with "last week" instead of "the period
 * before"), plus the days played and deaths per game. Null when the week has no games.
 */
export function weeklyFacts(
  input: {
    report: BattleReport;
    current: PeriodTotals;
    previous: PeriodTotals;
    mmrExact: number | null;
  },
  heroName: (heroId: number) => string,
): PeriodFacts | null {
  const base = periodFacts(input, heroName, {
    minGames: MIN_COACH_GAMES,
    previousLabel: "the week before",
  });
  if (!base) return null;
  const facts = [...base.facts];
  const r = input.report;
  facts.push({
    key: "daysPlayed",
    label: "Days this week with at least one game",
    value: r.days.size,
    unit: "count",
  });
  const busiest = Math.max(0, ...[...r.days.values()].map((d) => d.games));
  if (busiest > 1)
    facts.push({
      key: "mostGamesInADay",
      label: "Most games played in one day",
      value: busiest,
      unit: "count",
    });
  const deaths = r.heroes.reduce((s, h) => s + h.deaths, 0);
  facts.push({
    key: "avgDeaths",
    label: "Average deaths per game",
    value: round1(deaths / r.games),
    unit: "number",
  });
  return { facts, games: base.games };
}

/** The note as shown: a headline, a few short paragraphs, then the one fix for this week. */
export interface CoachNote {
  headline: string;
  paragraphs: string[];
  fix: { title: string; detail: string; factKeys: string[] };
  /** Fact keys the paragraphs use (the page lists them next to the note). */
  factKeys: string[];
}

/** Whether the text quotes this numeric fact (as given, rounded, or as its clock time). */
function quotes(text: string, f: GroundFact): boolean {
  if (typeof f.value !== "number") return false;
  if (f.unit === "clock") return text.includes(clock(f.value));
  const v = Math.abs(f.value);
  const forms = new Set([v, Math.round(v), round1(v)]);
  if (v >= 1000) forms.add(round1(v / 1000));
  const plain = text.replace(/(\d),(\d{3})/g, "$1$2");
  return [...plain.matchAll(/\d+(?:\.\d+)?/g)].some((m) => forms.has(Number(m[0])));
}

const MAX_HEADLINE = 90;
const MAX_PARAGRAPH = 500;
const MAX_FIX_TITLE = 90;
const MAX_FIX_DETAIL = 350;

/**
 * The model's note, checked (the coach checker rule): 1–3 paragraphs and one fix, within
 * length; it cites known facts; no number anywhere that the facts don't back; and the fix
 * quotes at least one number, every one of them from the facts the fix cites. The problems
 * found otherwise (sent back on a retry).
 */
export function checkCoachNote(
  note: CoachNote,
  facts: readonly GroundFact[],
): { ok: true; value: CoachNote } | { ok: false; error: string[] } {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const known = (keys: readonly string[]) => keys.filter((k) => byKey.has(k));
  const problems: string[] = [];
  const paragraphs = note.paragraphs.map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length < 1 || paragraphs.length > 3) problems.push("Write 1 to 3 paragraphs.");
  if (!note.headline.trim()) problems.push("Write a headline.");
  if (note.headline.length > MAX_HEADLINE)
    problems.push(`Keep the headline under ${MAX_HEADLINE} characters.`);
  if (paragraphs.some((p) => p.length > MAX_PARAGRAPH))
    problems.push(`Keep each paragraph under ${MAX_PARAGRAPH} characters.`);
  if (note.fix.title.length > MAX_FIX_TITLE || note.fix.detail.length > MAX_FIX_DETAIL)
    problems.push("Keep the fix short: a title and one or two sentences.");
  if (!note.fix.title.trim() || !note.fix.detail.trim())
    problems.push("End with exactly one fix for this week (a title and a detail).");

  const body = `${note.headline} ${paragraphs.join(" ")}`;
  // Keys like "winRate" or "hero2.gpm" are for citing, not for the player to read.
  const leaked = facts
    .map((f) => f.key)
    .filter((k) => /[.A-Z]/.test(k) && `${body} ${note.fix.title} ${note.fix.detail}`.includes(k));
  if (leaked.length)
    problems.push(
      `Don't write fact keys in the text (cite them only in the lists): ${leaked.join(", ")}.`,
    );
  const loose = ungroundedIn(body, facts);
  if (loose.length)
    problems.push(`The note uses numbers that are not in FACTS: ${loose.join(", ")}.`);
  if (known(note.factKeys).length === 0) problems.push("The note cites no fact from FACTS.");

  const fixText = `${note.fix.title} ${note.fix.detail}`;
  const fixKeys = known(note.fix.factKeys);
  if (fixKeys.length === 0) problems.push("The fix cites no fact from FACTS.");
  else {
    const cited = fixKeys.map((k) => byKey.get(k)!);
    const outside = ungroundedIn(fixText, cited);
    if (outside.length)
      problems.push(
        `The fix uses numbers that are not in the facts it cites: ${outside.join(", ")}.`,
      );
    else if (!cited.some((f) => quotes(fixText, f)))
      problems.push("Tie the fix to the player's numbers: quote one of the facts it cites.");
  }

  return problems.length
    ? { ok: false, error: problems }
    : {
        ok: true,
        value: {
          headline: note.headline.trim(),
          paragraphs,
          fix: {
            title: note.fix.title.trim(),
            detail: note.fix.detail.trim(),
            factKeys: fixKeys,
          },
          factKeys: known(note.factKeys),
        },
      };
}
