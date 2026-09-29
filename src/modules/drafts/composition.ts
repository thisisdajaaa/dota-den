import "server-only";
import { env } from "@/lib/env";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";

export const DEFAULT_DRAFT_AI_MODEL = "openai/gpt-oss-120b";

export async function getAiOpponent(): Promise<AiOpponentService> {
  const { GROQ_API_KEY, DRAFT_AI_MODEL, OPENDOTA_API_KEY, OPENDOTA_BASE_URL: baseUrl } = env();
  const heroes: AiHero[] = [...(await getHeroMap()).values()].map((h) => ({
    id: h.id,
    name: h.name,
    roles: h.roles,
  }));
  const advisor = GROQ_API_KEY
    ? new GroqDraftAdvisor({
        apiKey: GROQ_API_KEY,
        model: DRAFT_AI_MODEL ?? DEFAULT_DRAFT_AI_MODEL,
      })
    : null;
  const insights = new OpenDotaDraftInsights(openDotaGateway(), {
    baseUrl: baseUrl ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
  });
  return new AiOpponentService({ advisor, insights, heroes });
}
