import "server-only";
import { randomInt } from "node:crypto";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { GroqClient } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import {
  openDotaConfig,
  openDotaExplorerGateway,
  openDotaGateway,
} from "@/common/providers/opendota";
import { activityService } from "@/modules/leaderboards";
import { matchesService } from "@/modules/matches";
import { DraftRoomsController } from "./draft-rooms.controller";
import { DraftsController } from "./drafts.controller";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import { OpenDotaAbilityCatalog } from "./infrastructure/opendota-ability-catalog";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";
import { rankedLineups } from "./infrastructure/opendota-ranked-lineups";
import { DraftHistoryRepository } from "./repositories/draft-history.repository";
import { DraftMetaCacheRepository } from "./repositories/draft-meta-cache.repository";
import { DraftRoomsRepository } from "./repositories/draft-rooms.repository";
import { MatchDraftReadsRepository } from "./repositories/match-draft-reads.repository";
import type { AiHero } from "./dtos/responses/drafts.dto";
import { AiOpponentService } from "./services/ai-opponent.service";
import { ChallengeService } from "./services/challenge.service";
import { DraftHistoryService } from "./services/draft-history.service";
import { DraftRecordService } from "./services/draft-record.service";
import { DraftRoomService } from "./services/draft-room.service";
import type { DraftHero } from "./ui/types";

export const draftHistoryRepository = new DraftHistoryRepository(getDb);
export const draftMetaCacheRepository = new DraftMetaCacheRepository(getDb);
export const matchDraftReadsRepository = new MatchDraftReadsRepository(getDb);
/** Draft rooms with the configured retention (DRAFT_ROOM_TTL_HOURS), read when first used. */
export const draftRoomsRepository = new DraftRoomsRepository(getDb, {
  get ttlMs() {
    return env().DRAFT_ROOM_TTL_HOURS * 3_600_000;
  },
});

async function scoringHeroes(): Promise<AiHero[]> {
  return [...(await matchesService.heroMap()).values()].map((h) => ({
    id: h.id,
    name: h.name,
    roles: h.roles,
  }));
}

/** Tournament and public hero data for the AI captain, cached in MongoDB across instances. */
export function draftInsights(): OpenDotaDraftInsights {
  const config = env();
  return new OpenDotaDraftInsights(openDotaGateway(), {
    ...openDotaConfig(),
    explorer: openDotaExplorerGateway(),
    cache: draftMetaCacheRepository,
    budgetMs: config.DRAFT_EXPLORER_BUDGET_MS,
    proDays: config.DRAFT_PRO_WINDOW_DAYS,
    synergyDays: config.DRAFT_SYNERGY_WINDOW_DAYS,
    freshMs: config.DRAFT_META_FRESH_HOURS * 3_600_000,
  });
}

/**
 * The AI captain. Built per request because it holds the current hero catalog (a failed
 * catalog lookup must not stick for the life of the server).
 */
export async function getAiOpponent(): Promise<AiOpponentService> {
  const config = env();
  const advisor = config.GROQ_API_KEY
    ? new GroqDraftAdvisor(new GroqClient({ apiKey: config.GROQ_API_KEY }), {
        model: config.DRAFT_AI_MODEL,
        moveTimeoutMs: config.DRAFT_AI_MOVE_TIMEOUT_MS,
        reviewTimeoutMs: config.DRAFT_AI_REVIEW_TIMEOUT_MS,
      })
    : null;
  return new AiOpponentService({
    advisor,
    insights: draftInsights(),
    heroes: await scoringHeroes(),
    // The review answers "not configured" when it's switched off or there's no model key.
    reviewer: config.DRAFT_AI_REVIEW_ENABLED ? advisor : null,
    abilities: new OpenDotaAbilityCatalog(openDotaGateway(), openDotaConfig()),
    reviewCache: {
      get: async (key) => (await draftMetaCacheRepository.get(key).catch(() => null))?.body ?? null,
      put: (key, value) => draftMetaCacheRepository.put(key, value, new Date()),
    },
  });
}

/** Draft challenges: puzzles from the hero catalog, graded with the AI captain's data. */
export async function getChallengeService(): Promise<ChallengeService> {
  return new ChallengeService({ insights: draftInsights(), heroes: await scoringHeroes() });
}

const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
/** Unguessable 10-character room id (share links are the only way in). */
function newRoomId(): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
  return id;
}

export const draftHistoryService = new DraftHistoryService({
  history: draftHistoryRepository,
  getRoom: (roomId) => draftRoomsRepository.get(roomId),
  existingRoomIds: (roomIds) => draftRoomsRepository.existingIds(roomIds),
});

export const draftRoomService = new DraftRoomService({
  rooms: draftRoomsRepository,
  heroPool: async () => [...(await matchesService.heroMap()).keys()],
  newId: newRoomId,
  get enabled() {
    return env().FEATURE_DRAFT_ROOMS;
  },
  get limits() {
    const config = env();
    return {
      maxActiveRooms: config.DRAFT_ROOMS_MAX_ACTIVE,
      activeWindowMs: config.DRAFT_ROOMS_ACTIVE_WINDOW_MINUTES * 60_000,
    };
  },
  // A failed history write must not fail the final pick; the room page and the result
  // endpoints save a finished room that is missing from history.
  onCompleted: async (room) => {
    try {
      await draftHistoryService.recordCompleted(room);
    } catch (error) {
      logger.error("draft_history_record_failed", { roomId: room.id, error });
    }
  },
});

export const draftRecordService = new DraftRecordService({
  lineups: (accountId32, limit) =>
    rankedLineups(openDotaGateway(), openDotaConfig(), accountId32, limit),
  reads: matchDraftReadsRepository,
  outlook: getAiOpponent,
});

/** The hero catalog as the draft screens need it, sorted by name. Empty if unavailable. */
export async function getDraftHeroes(): Promise<DraftHero[]> {
  return [...(await matchesService.heroMap()).values()]
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

export const draftsController = new DraftsController({
  ai: getAiOpponent,
  challenges: getChallengeService,
  // A failure here must never cost the player their grade, so it's logged and skipped.
  recordChallenge: async (userId, answer) => {
    try {
      const { counted, streak } = await activityService.recordChallenge(userId, answer);
      return { counted, streak: streak.current, best: streak.best };
    } catch (error) {
      logger.error("challenge_attempt_record_failed", { error });
      return null;
    }
  },
  logger,
});

export const draftRoomsController = new DraftRoomsController({
  rooms: draftRoomService,
  history: draftHistoryService,
  events: (roomId, after) => draftRoomService.events(roomId, after),
  captainProfile: (accountId32) => matchesService.playerProfile(accountId32),
});

/** Friend-room drafts: exported, and anonymised (not deleted) since they're shared. */
export const draftsPrivacy = {
  exportMyData: async (owner: { userId: string; accountId32: number }) => ({
    friendRoomDrafts: await draftHistoryRepository.exportForOwner(owner),
  }),
  deleteMyData: async (owner: { userId: string; accountId32: number }) => ({
    friendRoomDraftsAnonymised: await draftHistoryRepository.anonymiseOwner(owner),
  }),
};
