import {
  factLabel,
  type CoachFactSheet,
  type CoachLocale,
  type CoachMissing,
} from "../../domain/coach-facts";
import { COACH_MAX_POINTS, COACH_MIN_POINTS, factLines } from "../../domain/coach-review";

/**
 * The AI match coach's prompt (pure, so it can be read and tested on its own). The model only
 * sees the fact sheet; every answer is checked against it before it's shown (ADR 0014).
 */

const MISSING_TEXT: Record<CoachMissing, string> = {
  patch: "the patch this game was played on",
  party: "whether the player queued alone or in a party (unknown, NOT solo)",
  laneRole: "the lane role",
  laneOpponents: "lane opponents (jungle, roaming or an empty lane)",
  laningAt10: "some numbers at 10 minutes",
  itemTimings: "item timings",
  benchmarks: "percentiles against other games on this hero",
  teamfightDeaths: "where deaths happened in team fights",
  damage: "hero and tower damage",
  wards: "ward counts",
};

/** The language each interface locale asks the coach to write in. */
export const COACH_LANGUAGES: Record<CoachLocale, string> = {
  en: "English",
  fil: "Filipino (Tagalog, the natural everyday Filipino players use, keeping common Dota terms in English)",
  ceb: "Cebuano (Bisaya, the natural everyday Cebuano players use, keeping common Dota terms in English)",
};

export function coachPrompt(
  sheet: CoachFactSheet,
  opts: { locale: CoachLocale; problems?: readonly string[] },
): { system: string; user: string } {
  const language = COACH_LANGUAGES[opts.locale];
  const system = [
    "You are a calm, specific Dota 2 coach reviewing ONE public match for the player who played it.",
    `Write ${COACH_MIN_POINTS} to ${COACH_MAX_POINTS} short coaching points about how THEY played, based ONLY on the FACTS below.`,
    "Every number you write must be a value from FACTS (as given, rounded, or in thousands like 3.8k), small counts included: if you write 'died 4 times', FACTS must say deaths 4. The only numbers that need no fact are minute markers: 'minute 10', 'the first 10 minutes', '10-minute'. A clock time like 18:20 is a stat: write it only when FACTS has it. Never invent, estimate or average a statistic, a benchmark, a timing, a rank or a win probability. Do not compare with 'typical' or 'pro' numbers unless a percentile fact says so. Advice has no target numbers or times of its own ('stack at 2:30', 'get BKB by 25 minutes', '10 last hits a minute'): say what to do and why, without a number.",
    "Each point cites the fact keys it relies on in `facts` (one or more keys from FACTS, spelled exactly). Points without a cited fact are not allowed.",
    "Mix strengths and things to improve; for an improvement, say one concrete thing to try next game. Plain language, second person, no hype, no hedging filler.",
    "If data the advice would need is listed under MISSING, say so briefly in the point instead of guessing. A party status of 'unknown' means unknown: never call the player solo or partied in that case.",
    `Write the title and detail in ${language}. Keep hero names, item names, the JSON keys, the fact keys and every number exactly as given; translate only your own words.`,
    'Reply with JSON only: {"points": [{"kind": "strength" | "improve", "title": "<max 80 characters>", "detail": "<1-3 sentences, max 400 characters>", "facts": ["<fact key>", ...]}]}.',
  ].join(" ");
  const user = [
    `MATCH ${sheet.matchId}: the player was on ${sheet.heroName}.`,
    `LANGUAGE: ${opts.locale} (${language}).`,
    "FACTS (key | what it is | value):",
    ...factLines(sheet, factLabel),
    sheet.missing.length
      ? `MISSING (not available for this match): ${sheet.missing.map((m) => MISSING_TEXT[m]).join("; ")}.`
      : "MISSING: nothing.",
    ...(opts.problems?.length
      ? [
          "Your previous answer was rejected:",
          ...opts.problems.map((p) => `- ${p}`),
          "Answer again, following the rules exactly.",
        ]
      : []),
  ].join("\n");
  return { system, user };
}
