import "server-only";
import { env } from "@/lib/env";
import { getHeroMap } from "@/modules/matches/composition";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";

export const DEFAULT_DRAFT_AI_MODEL = "openai/gpt-oss-120b";

export async function getAiOpponent(): Promise<AiOpponentService> {
  const { GROQ_API_KEY, DRAFT_AI_MODEL } = env();
  const heroes: AiHero[] = [...(await getHeroMap()).values()]
    .filter((h) => h.primaryAttr && h.attackType)
    .map((h) => ({
      id: h.id,
      name: h.name,
      roles: h.roles,
      attackType: h.attackType!,
      primaryAttr: h.primaryAttr!,
    }));
  const advisor = GROQ_API_KEY
    ? new GroqDraftAdvisor({
        apiKey: GROQ_API_KEY,
        model: DRAFT_AI_MODEL ?? DEFAULT_DRAFT_AI_MODEL,
      })
    : null;
  return new AiOpponentService({ advisor, heroes });
}
