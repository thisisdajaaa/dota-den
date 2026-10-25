import type { GroundFact } from "@/common/utils/grounding";
import { factLine, type ReadLocale } from "../../domain/period-read";

/** The language each interface locale asks for (the coach's wording). */
const LANGUAGES: Record<ReadLocale, string> = {
  en: "English",
  fil: "Filipino (Tagalog, the natural everyday Filipino players use, keeping common Dota terms in English)",
  ceb: "Cebuano (Bisaya, the natural everyday Cebuano players use, keeping common Dota terms in English)",
};

/**
 * The AI read of a battle report period (pure). The model sees only the FACTS; its answer is
 * checked against them before it's shown, like the match coach's.
 */
export function periodReadPrompt(
  input: { from: string; to: string; facts: readonly GroundFact[] },
  opts: { locale: ReadLocale; problems?: readonly string[] },
): { system: string; user: string } {
  const language = LANGUAGES[opts.locale];
  const system = [
    "You are a calm, specific Dota 2 coach looking at one player's games over a period (their own battle report).",
    'Write 3 to 5 short points about patterns in how the period went, based ONLY on the FACTS below: what went well, what to work on, and exactly ONE "focus" for the next games.',
    "Every number you write must be a value from FACTS (as given, rounded, or in thousands like 3.8k), small counts included. Never invent, estimate or average a statistic, a rank, an MMR or a win probability, and never compare with 'typical' or 'pro' numbers. Advice has no target numbers of its own: say what to do and why, without a number.",
    "Compare with the period before only through the prev* facts. Hero facts are numbered by games played: use the hero's name from heroN.name.",
    "Each point cites the fact keys it relies on in `facts` (one or more keys from FACTS, spelled exactly). Points without a cited fact are not allowed.",
    "Plain language, second person, no hype, no hedging filler.",
    `Write the title and detail in ${language}. Keep hero names, the JSON keys, the fact keys and every number exactly as given; translate only your own words.`,
    'Reply with JSON only: {"points": [{"kind": "strength" | "improve" | "focus", "title": "<max 80 characters>", "detail": "<1-3 sentences, max 400 characters>", "facts": ["<fact key>", ...]}]}.',
  ].join(" ");
  const user = [
    `PERIOD: ${input.from} to ${input.to}.`,
    `LANGUAGE: ${opts.locale} (${language}).`,
    "FACTS (key | what it is: value):",
    ...input.facts.map(factLine),
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
