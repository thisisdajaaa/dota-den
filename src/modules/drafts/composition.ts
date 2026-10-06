import "server-only";
import { openDotaExplorerGateway } from "@/common/providers/opendota";
import type { DataOwner } from "@/common/privacy/user-data";
import { randomInt } from "node:crypto";
import type { Db } from "mongodb";
import { getDb } from "@/common/db/mongo";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { matchesService } from "@/modules/matches";
import { openDotaGateway } from "@/common/providers/opendota";
import { AiOpponentService, type AiHero } from "./application/ai-opponent-service";
import { ChallengeService } from "./application/challenge-service";
import { DraftHistoryService } from "./application/draft-history-service";
import { DraftRoomService } from "./application/draft-room-service";
import { GroqDraftAdvisor } from "./infrastructure/groq-draft-advisor";
import {
  MongoDraftHistoryRepository,
  roomDraftCountsByUser,
} from "./infrastructure/mongo-draft-history";
import { MongoDraftMetaCache } from "./infrastructure/mongo-draft-meta-cache";
import { OpenDotaAbilityCatalog } from "./infrastructure/opendota-ability-catalog";
import { MongoDraftRoomRepository } from "./infrastructure/mongo-draft-rooms";
import { OpenDotaDraftInsights } from "./infrastructure/opendota-draft-insights";
import type { DraftHero } from "./ui/types";
import { draftRecord, type DraftRecord } from "./domain/draft-record";
import { findDraftReads, rankedLineups, saveDraftRead } from "./infrastructure/match-draft-reads";
import * as userData from "./infrastructure/user-data";

async function scoringHeroes(): Promise<AiHero[]> {
  return [...(await matchesService.heroMap()).values()].map((h) => ({
    id: h.id,
    name: h.name,
    roles: h.roles,
  }));
}

export async function draftInsights(): Promise<OpenDotaDraftInsights> {
  const config = env();
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL: baseUrl } = config;
  // Without the database the tournament data still works, just uncached across instances.
  const cache = await getDb()
    .then((db) => new MongoDraftMetaCache(db))
    .catch(() => undefined);
  return new OpenDotaDraftInsights(openDotaGateway(), {
    baseUrl: baseUrl ?? "https://api.opendota.com/api",
    apiKey: OPENDOTA_API_KEY,
    explorer: openDotaExplorerGateway(),
    cache,
    budgetMs: config.DRAFT_EXPLORER_BUDGET_MS,
    proDays: config.DRAFT_PRO_WINDOW_DAYS,
    synergyDays: config.DRAFT_SYNERGY_WINDOW_DAYS,
    freshMs: config.DRAFT_META_FRESH_HOURS * 3_600_000,
  });
}

export async function getAiOpponent(): Promise<AiOpponentService> {
  const {
    GROQ_API_KEY,
    DRAFT_AI_MODEL,
    DRAFT_AI_MOVE_TIMEOUT_MS,
    DRAFT_AI_REVIEW_TIMEOUT_MS,
    DRAFT_AI_REVIEW_ENABLED,
    OPENDOTA_API_KEY,
    OPENDOTA_BASE_URL,
  } = env();
  const heroes = await scoringHeroes();
  const advisor = GROQ_API_KEY
    ? new GroqDraftAdvisor({
        apiKey: GROQ_API_KEY,
        model: DRAFT_AI_MODEL,
        moveTimeoutMs: DRAFT_AI_MOVE_TIMEOUT_MS,
        reviewTimeoutMs: DRAFT_AI_REVIEW_TIMEOUT_MS,
      })
    : null;
  const cache = await getDb()
    .then((db) => new MongoDraftMetaCache(db))
    .catch(() => null);
  return new AiOpponentService({
    advisor,
    insights: await draftInsights(),
    heroes,
    // The review answers "not configured" when it's switched off or there's no model key.
    reviewer: DRAFT_AI_REVIEW_ENABLED ? advisor : null,
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

/** Draft rooms repository with the configured retention (DRAFT_ROOM_TTL_HOURS). */
function roomRepository(db: Db): MongoDraftRoomRepository {
  return new MongoDraftRoomRepository(db, { ttlMs: env().DRAFT_ROOM_TTL_HOURS * 3_600_000 });
}

export async function getDraftHistoryService(): Promise<DraftHistoryService> {
  const db = await getDb();
  const rooms = roomRepository(db);
  return new DraftHistoryService({
    history: new MongoDraftHistoryRepository(db),
    getRoom: (roomId) => rooms.get(roomId),
    existingRoomIds: (roomIds) => rooms.existingIds(roomIds),
  });
}

export async function getDraftRoomService(): Promise<DraftRoomService> {
  const db = await getDb();
  const history = await getDraftHistoryService();
  const config = env();
  return new DraftRoomService({
    rooms: roomRepository(db),
    heroPool: async () => [...(await matchesService.heroMap()).keys()],
    newId: newRoomId,
    enabled: config.FEATURE_DRAFT_ROOMS,
    limits: {
      maxActiveRooms: config.DRAFT_ROOMS_MAX_ACTIVE,
      activeWindowMs: config.DRAFT_ROOMS_ACTIVE_WINDOW_MINUTES * 60_000,
    },
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
  return roomRepository(await getDb()).eventsSince(roomId, after, 100);
}

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

/** Admin overview: finished room drafts per captain. */
export async function getRoomDraftCounts(userIds: readonly string[]) {
  return roomDraftCountsByUser(await getDb(), userIds);
}

/** Ranked games looked at, and new games graded per request (each costs matchup lookups). */
const DRAFT_RECORD_GAMES = 30;
const DRAFT_RECORD_NEW_PER_VIEW = 6;

export interface DraftRecordView {
  record: DraftRecord;
  /** Recent ranked games with full lineups. */
  total: number;
  accuracy: number;
}

/**
 * Your recent ranked games graded by the draft outlook. Grades are saved per match and
 * filled a few at a time, so the first views show a partial count. Null when OpenDota
 * can't be read.
 */
export async function getDraftRecord(accountId32: number): Promise<DraftRecordView | null> {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  const lineups = await rankedLineups(
    openDotaGateway(),
    { baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api", apiKey: OPENDOTA_API_KEY },
    accountId32,
    DRAFT_RECORD_GAMES,
  );
  if (!lineups) return null;
  const db = await getDb();
  const saved = await findDraftReads(
    db,
    lineups.map((l) => l.matchId),
  );
  const ai = await getAiOpponent();
  const missing = lineups.filter((l) => !saved.has(l.matchId)).slice(0, DRAFT_RECORD_NEW_PER_VIEW);
  let accuracy = 0.57;
  for (const l of missing) {
    const outlook = await ai.outlookForHeroes(l.radiant, l.dire).catch(() => null);
    if (!outlook || outlook.radiantPct === null) continue;
    accuracy = outlook.accuracy.fitted;
    saved.set(l.matchId, outlook.radiantPct);
    await saveDraftRead(db, l.matchId, outlook.radiantPct).catch(() => {});
  }
  const graded = lineups.flatMap((l) =>
    saved.has(l.matchId)
      ? [{ yourSide: l.yourSide, won: l.won, radiantPct: saved.get(l.matchId)! }]
      : [],
  );
  return { record: draftRecord(graded), total: lineups.length, accuracy };
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
