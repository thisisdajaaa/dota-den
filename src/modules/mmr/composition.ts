import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/mongo";
import { MmrJournalService } from "./application/mmr-journal-service";
import { isValidTimeZone } from "./domain/day-key";
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
