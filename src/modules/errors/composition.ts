import "server-only";
import { getDb } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
import { isNoise, newErrorEvent, type ErrorSource } from "./domain/error-event";
import { errorGroups, insertErrorEvent } from "./infrastructure/mongo-error-log";

/** Record an error for the admin page. Never throws: reporting must not cause errors. */
export async function recordError(input: {
  source: ErrorSource;
  message: string;
  digest?: string | null;
  path?: string | null;
  route?: string | null;
  kind?: string | null;
  stack?: string | null;
}): Promise<void> {
  if (isNoise(input.message)) return;
  try {
    await insertErrorEvent(await getDb(), newErrorEvent({ ...input, at: new Date() }));
  } catch (e) {
    logger.warn("error_record_failed", { reason: e instanceof Error ? e.message : "unknown" });
  }
}

/** Admin: distinct errors in the last `days` days. */
export async function getErrorGroups(days = 7) {
  return errorGroups(await getDb(), new Date(Date.now() - days * 24 * 3_600_000));
}
