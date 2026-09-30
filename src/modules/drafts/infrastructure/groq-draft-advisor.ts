import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type {
  AdvisorError,
  AdvisorHero,
  AdvisorRequest,
  DraftAdvisor,
  DraftReviewer,
  ReviewRequest,
} from "../application/ports";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});
const AnswerSchema = z.object({
  heroId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(400),
});

const list = (heroes: readonly AdvisorHero[]): string =>
  heroes.length ? heroes.map((h) => h.name).join(", ") : "none";

/** Groq's OpenAI-compatible API (e.g. openai/gpt-oss-120b). */
export class GroqDraftAdvisor implements DraftAdvisor, DraftReviewer {
  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      fetch?: (url: string, init: RequestInit) => Promise<Response>;
      timeoutMs?: number;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async suggest(
    req: AdvisorRequest,
  ): Promise<Result<{ heroId: number; reason: string }, AdvisorError>> {
    const system = [
      "You are the captain of one team in a Dota 2 Captain's Mode draft against a human.",
      "The server has already scored the legal options using current high-rank public win rates, recent tournament picks and bans, pro hero pairings, and head-to-head matchup data.",
      "Think like a pro captain in the current patch: early bans remove the heroes tournaments fight over (most contested) or that counter your picks; early picks favour contested, flexible heroes; last picks counter what the opponent has shown.",
      "Choose exactly ONE hero id from the CANDIDATES list. Never choose anything else.",
      "Keep the two teams straight: YOUR TEAM are your heroes; OPPONENT heroes are the enemy. Never call an opponent hero a teammate or 'synergy'.",
      "A lineup has five positions: Carry (pos 1), Mid (pos 2), Offlane (pos 3), Soft support (pos 4) and Hard support (pos 5). Each candidate's facts say which position it would play and how often pros play it there.",
      "Follow the SITUATION line: pick a hero for one of YOUR open positions, never a second hero for a filled one. When banning, prefer heroes that fill the OPPONENT's open positions.",
      "Prefer higher-listed candidates unless there's a clear draft reason (lane pairing, a counter, a combo with YOUR heroes).",
      "Weigh the lane: facts saying 'in lane vs ...: won X of Y pro lanes' show who the candidate would lane against; avoid picks that lose their lane badly unless they win the game later.",
      "When you cite a percentage from a small sample (under 50 games), include the game count.",
      'Reply with JSON only: {"heroId": <number>, "reason": "<one sentence, max 30 words, plain language, citing the data or your heroes>"}.',
    ].join(" ");
    const user = [
      `ACTION: ${req.action.toUpperCase()} (step ${req.stepNumber} of ${req.totalSteps}).`,
      `YOUR TEAM picks: ${list(req.ownPicks)}. Your bans: ${list(req.ownBans)}.`,
      `OPPONENT picks: ${list(req.enemyPicks)}. Opponent bans: ${list(req.enemyBans)}.`,
      `SITUATION: ${req.situation}`,
      ...(req.metaContext?.length ? [`META: ${req.metaContext.join(" ")}`] : []),
      req.action === "ban"
        ? "For a ban, deny the opponent a hero that beats YOUR picks or completes THEIR lineup."
        : "For a pick, strengthen YOUR lineup and punish the OPPONENT's picks.",
      "CANDIDATES (best first):",
      ...req.candidates.map((c) => `${c.id}: ${c.name} [${c.role}] - ${c.facts.join("; ")}`),
    ].join("\n");

    let content: string | null;
    try {
      const res = await (this.opts.fetch ?? fetch)(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.opts.model,
          reasoning_effort: "medium",
          temperature: 0.3,
          max_completion_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
      });
      if (!res.ok) return err({ type: "unavailable", cause: `status ${res.status}` });
      const parsed = CompletionSchema.safeParse(await res.json());
      if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
      content = parsed.data.choices[0].message.content;
    } catch (e) {
      return err({ type: "unavailable", cause: e instanceof Error ? e.name : "unknown" });
    }

    try {
      const answer = AnswerSchema.safeParse(JSON.parse(content ?? ""));
      return answer.success
        ? ok(answer.data)
        : err({ type: "invalid_response", cause: "answer shape" });
    } catch {
      return err({ type: "invalid_response", cause: "not json" });
    }
  }

  /** Review a finished draft. Returns the model's JSON unvalidated; the caller validates it. */
  async review(req: ReviewRequest): Promise<Result<unknown, AdvisorError>> {
    const system = [
      "You are an expert Dota 2 analyst reviewing a finished Captain's Mode draft for a player.",
      "You are given each hero's position and its CURRENT abilities (from this patch's game files), plus statistics we computed from recent high-rank and pro games. Trust the abilities and statistics given; do not rely on memory of older patches.",
      "Only claim a spell interaction if the listed ability descriptions support it: an ability that affects enemy heroes can't be used on or with allies (for example, a spell that copies an enemy's spell can't copy a teammate's), and an ability without 'pierces spell immunity' doesn't go through Black King Bar.",
      "Explain what the numbers can't: hero combos and spell interactions, who each side must kill or protect, win conditions, and timing. Only mention heroes in the draft, spelled exactly as given.",
      "You may nudge only two report-card criteria, 'combos' and 'composition', by at most 8 points each per side, and only with a concrete reason based on the abilities (for example a stun chain, a big combined teamfight ultimate, or a missing answer to invisibility). Leave adjustments empty if nothing stands out. Never invent statistics or win rates.",
      'Reply with JSON only: {"summary": "<2-3 sentences: who the draft favours and why>", "sides": {"radiant": {"winCondition": "...", "strengths": ["..."], "risks": ["..."], "timing": "..."}, "dire": {...}}, "combos": [{"side": "radiant"|"dire", "heroes": ["Hero", "Hero"], "why": "..."}], "keyMatchups": [{"heroes": ["Hero", "Hero"], "note": "..."}], "adjustments": [{"side": "radiant"|"dire", "criterion": "combos"|"composition", "delta": <integer -8..8>, "reason": "..."}]}. Plain language, short sentences.',
    ].join(" ");
    const lineup = (side: "radiant" | "dire") =>
      req.lineups[side]
        .map(
          (h) =>
            `- ${h.name} (${h.position}): ${h.abilities
              .map((a) => `${a.name}${a.tags.length ? ` [${a.tags.join(", ")}]` : ""}: ${a.desc}`)
              .join(" | ")}`,
        )
        .join("\n");
    const user = [
      "RADIANT:",
      lineup("radiant"),
      "DIRE:",
      lineup("dire"),
      "EVIDENCE (computed from data):",
      ...req.evidence.map((e) => `- ${e}`),
    ].join("\n");

    let content: string | null;
    try {
      const res = await (this.opts.fetch ?? fetch)(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.opts.model,
          reasoning_effort: "medium",
          temperature: 0.2,
          max_completion_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
      });
      if (!res.ok) return err({ type: "unavailable", cause: `status ${res.status}` });
      const parsed = CompletionSchema.safeParse(await res.json());
      if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
      content = parsed.data.choices[0].message.content;
    } catch (e) {
      return err({ type: "unavailable", cause: e instanceof Error ? e.name : "unknown" });
    }
    try {
      return ok(JSON.parse(content ?? "") as unknown);
    } catch {
      return err({ type: "invalid_response", cause: "not json" });
    }
  }
}
