import type { ObjectId } from "mongodb";
import type { MedalSnapshot } from "./domain/medal-history";
import type { MmrEntry } from "./domain/mmr-entry";

export const MMR_SCHEMA_VERSION = 1;
export const MMR_COLLECTIONS = { entries: "mmr_entries" } as const;

export interface MmrEntryDoc extends Omit<MmrEntry, "id"> {
  _id: ObjectId;
  schemaVersion: number;
}

export const MEDAL_COLLECTION = "rank_history";

export interface MedalDoc extends MedalSnapshot {
  accountId32: number;
  lastSeenAt: Date;
}
