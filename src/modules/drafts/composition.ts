import "server-only";
import { env } from "@/lib/env";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { ChallengeService } from "./application/challenge-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";

export const DEFAULT_DRAFT_AI_MODEL = "openai/gpt-oss-120b";

async function scoringHeroes(): Promise<AiHero[]> {
  return [...(await getHeroMap()).values()].map((h) => ({
    id: h.id,
    name: h.name,
    roles: h.roles,
  }));
}

function draftInsights(): OpenDotaDraftInsights {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL: baseUrl } = env();
  return new OpenDotaDraftInsights(openDotaGateway(), {
    baseUrl: baseUrl ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
  });
}

export async function getAiOpponent(): Promise<AiOpponentService> {
  const { GROQ_API_KEY, DRAFT_AI_MODEL } = env();
  const heroes = await scoringHeroes();
  const advisor = GROQ_API_KEY
    ? new GroqDraftAdvisor({
        apiKey: GROQ_API_KEY,
        model: DRAFT_AI_MODEL ?? DEFAULT_DRAFT_AI_MODEL,
      })
    : null;
  return new AiOpponentService({ advisor, insights: draftInsights(), heroes });
}

/** Draft challenges: puzzles from the hero catalog, graded with the AI captain's data. */
export async function getChallengeService(): Promise<ChallengeService> {
  return new ChallengeService({ insights: draftInsights(), heroes: await scoringHeroes() });
}
