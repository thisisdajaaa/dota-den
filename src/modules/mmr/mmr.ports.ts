import type { ScreenshotRead } from "./domain/screenshot-read";
import type { MmrEntry } from "./domain/mmr-entry";

export interface MmrEntriesPort {
  create(entry: Omit<MmrEntry, "id">): Promise<MmrEntry>;
  /** Scoped by owner: returns null for other users' entries. */
  findOwned(id: string, userId: string): Promise<MmrEntry | null>;
  updateOwned(
    id: string,
    userId: string,
    patch: Pick<MmrEntry, "mmr" | "observedAt" | "note" | "updatedAt">,
  ): Promise<MmrEntry | null>;
  deleteOwned(id: string, userId: string): Promise<boolean>;
  /** One account's entries, oldest first. Accounts never mix. */
  list(
    userId: string,
    accountId32: number,
    range?: { from?: Date; to?: Date },
  ): Promise<MmrEntry[]>;
}

/** Reads the MMR shown in a screenshot (an AI vision model). */
export interface ScreenshotReader {
  read(image: { type: string; base64: string }): Promise<ScreenshotRead | null>;
}
