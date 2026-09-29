import "server-only";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { ChallengeService } from "./application/challenge-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import { MongoDraftMetaCache } from "./infrastructure/mongo-draft-meta-cache";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";

export const DEFAULT_DRAFT_AI_MODEL = "openai/gpt-oss-120b";

async function scoringHeroes(): Promise<AiHero[]> {
  return [...(await getHeroMap()).values()].map((h) => ({
    id: h.id,
    name: h.name,
    roles: h.roles,
  }));
}

const globalForExplorer = globalThis as typeof globalThis & { __ddExplorer?: ProviderGateway };

/** OpenDota's SQL explorer is slow: its own timeout and circuit breaker. */
function explorerGateway(): ProviderGateway {
  globalForExplorer.__ddExplorer ??= new ProviderGateway({
    name: "opendota-explorer",
    timeoutMs: 30_000,
    maxRetries: 1,
    onRequest: ({ status, durationMs, attempt }) =>
      logger.info("provider_request", {
        provider: "opendota-explorer",
        status,
        durationMs,
        attempt,
      }),
  });
  return globalForExplorer.__ddExplorer;
}

export async function draftInsights(): Promise<OpenDotaDraftInsights> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL: baseUrl } = env();
  // Without the database the tournament data still works, just uncached across instances.
  const cache = await getDb()
    .then((db) => new MongoDraftMetaCache(db))
    .catch(() => undefined);
  return new OpenDotaDraftInsights(openDotaGateway(), {
    baseUrl: baseUrl ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
    explorer: explorerGateway(),
    cache,
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
  return new AiOpponentService({ advisor, insights: await draftInsights(), heroes });
}

/** Draft challenges: puzzles from the hero catalog, graded with the AI captain's data. */
export async function getChallengeService(): Promise<ChallengeService> {
  return new ChallengeService({
    insights: await draftInsights(),
    heroes: await scoringHeroes(),
  });
}
