import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MmrJournalService } from "./application/mmr-journal-service";
import { GroqScreenshotReader } from "./infrastructure/groq-screenshot-reader";
import { isValidTimeZone } from "./domain/day-key";
import { medalHistory, recordMedalSighting } from "./infrastructure/mongo-medal-history";
import {
  MongoMmrEntryRepository,
  mmrEntryCountsByUser,
} from "./infrastructure/mongo-mmr-repository";

export const TZ_COOKIE = "dd_tz";

export async function getMmrJournal(): Promise<MmrJournalService> {
  return new MmrJournalService(new MongoMmrEntryRepository(await getDb()));
}

/** Viewer's IANA time zone from the cookie the browser sets; UTC until it's known. */
export async function getViewerTimeZone(): Promise<{ timeZone: string; known: boolean }> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return tz && isValidTimeZone(tz)
    ? { timeZone: tz, known: true }
    : { timeZone: "UTC", known: false };
}

/** Admin overview: MMR entries per user. */
export async function getMmrEntryCounts(userIds: readonly string[]) {
  return mmrEntryCountsByUser(await getDb(), userIds);
}

/** Reads MMR from screenshots; null when no AI provider is configured. */
export function getScreenshotReader(): GroqScreenshotReader | null {
  const { GROQ_API_KEY, MMR_VISION_MODEL } = env();
  return GROQ_API_KEY
    ? new GroqScreenshotReader({ apiKey: GROQ_API_KEY, model: MMR_VISION_MODEL })
    : null;
}

/** Note the player's current medal (a change adds to their medal history). Never throws. */
export async function recordMedal(accountId32: number, rankTier: number | null): Promise<void> {
  try {
    await recordMedalSighting(await getDb(), accountId32, rankTier, new Date());
  } catch (e) {
    logger.warn("medal_record_failed", {
      accountId32,
      reason: e instanceof Error ? e.message : "unknown",
    });
  }
}

/** Medal sightings, oldest first. */
export async function getMedalHistory(accountId32: number) {
  return medalHistory(await getDb(), accountId32);
}
