import { factLabel, type CoachFactSheet, type CoachMissing } from "../../domain/coach-facts";
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

export function coachPrompt(
  sheet: CoachFactSheet,
  opts: { problems?: readonly string[] } = {},
): { system: string; user: string } {
  const system = [
    "You are a calm, specific Dota 2 coach reviewing ONE public match for the player who played it.",
    `Write ${COACH_MIN_POINTS} to ${COACH_MAX_POINTS} short coaching points about how THEY played, based ONLY on the FACTS below.`,
    "Every number you write must appear in FACTS exactly as given (you may round a value or write a clock time as given). Never invent, estimate or average a statistic, a benchmark, a timing, a rank or a win probability. Do not compare with 'typical' or 'pro' numbers unless a percentile fact says so.",
    "Each point cites the fact keys it relies on in `facts` (one or more keys from FACTS, spelled exactly). Points without a cited fact are not allowed.",
    "Mix strengths and things to improve; for an improvement, say one concrete thing to try next game. Plain language, second person, no hype, no hedging filler.",
    "If data the advice would need is listed under MISSING, say so briefly in the point instead of guessing. A party status of 'unknown' means unknown: never call the player solo or partied in that case.",
    'Reply with JSON only: {"points": [{"kind": "strength" | "improve", "title": "<max 80 characters>", "detail": "<1-3 sentences, max 400 characters>", "facts": ["<fact key>", ...]}]}.',
  ].join(" ");
  const user = [
    `MATCH ${sheet.matchId}: the player was on ${sheet.heroName}.`,
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
