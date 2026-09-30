import "server-only";
import { randomInt } from "node:crypto";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getHeroMap, openDotaGateway } from "@/modules/matches/composition";
import { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { ChallengeService } from "./application/challenge-service";
import { DraftHistoryService } from "./application/draft-history-service";
import { DraftRoomService } from "./application/draft-room-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import { MongoDraftHistoryRepository } from "./infrastructure/mongo-draft-history";
import { MongoDraftMetaCache } from "./infrastructure/mongo-draft-meta-cache";
import { OpenDotaAbilityCatalog } from "./infrastructure/opendota-ability-catalog";
import { MongoDraftRoomRepository } from "./infrastructure/mongo-draft-rooms";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";
import type { DraftHero } from "./ui/types";

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
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const cache = await getDb()
    .then((db) => new MongoDraftMetaCache(db))
    .catch(() => null);
  return new AiOpponentService({
    advisor,
    insights: await draftInsights(),
    heroes,
    reviewer: advisor,
    abilities: new OpenDotaAbilityCatalog(openDotaGateway(), {
      baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
      apiKey: OPENDOTA_API_KEY,
    }),
    reviewCache: cache
      ? {
          get: async (key) => (await cache.get(key))?.body ?? null,
          put: (key, value) => cache.put(key, value, new Date()),
        }
      : null,
  });
}

/** Draft challenges: puzzles from the hero catalog, graded with the AI captain's data. */
export async function getChallengeService(): Promise<ChallengeService> {
  return new ChallengeService({
    insights: await draftInsights(),
    heroes: await scoringHeroes(),
  });
}

const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Unguessable 10-character room id (share links are the only way in). */
function newRoomId(): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
  return id;
}

export async function getDraftHistoryService(): Promise<DraftHistoryService> {
  const db = await getDb();
  const rooms = new MongoDraftRoomRepository(db);
  return new DraftHistoryService({
    history: new MongoDraftHistoryRepository(db),
    getRoom: (roomId) => rooms.get(roomId),
    existingRoomIds: (roomIds) => rooms.existingIds(roomIds),
  });
}

export async function getDraftRoomService(): Promise<DraftRoomService> {
  const db = await getDb();
  const history = await getDraftHistoryService();
  return new DraftRoomService({
    rooms: new MongoDraftRoomRepository(db),
    heroPool: async () => [...(await getHeroMap()).keys()],
    newId: newRoomId,
    enabled: env().FEATURE_DRAFT_ROOMS,
    // A failed history write must not fail the final pick; the room page and the result
    // endpoints save a finished room that is missing from history.
    onCompleted: async (room) => {
      try {
        await history.recordCompleted(room);
      } catch (error) {
        logger.error("draft_history_record_failed", { roomId: room.id, error });
      }
    },
  });
}

export async function getDraftRoomEvents(roomId: string, after: number) {
  return new MongoDraftRoomRepository(await getDb()).eventsSince(roomId, after, 100);
}

/** The hero catalog as the draft screens need it, sorted by name. Empty if unavailable. */
export async function getDraftHeroes(): Promise<DraftHero[]> {
  return [...(await getHeroMap()).values()]
    .map((h) => ({
      id: h.id,
      name: h.name,
      imageUrl: h.imageUrl,
      iconUrl: h.iconUrl,
      primaryAttr: h.primaryAttr,
      roles: h.roles,
      attackType: h.attackType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
