/** A user-entered, dated observation of their actual MMR (spec §2.1). Never derived. */
export interface MmrEntry {
  id: string;
  userId: string;
  accountId32: number;
  observedAt: Date;
  mmr: number;
  note: string | null;
  source: "user";
  createdAt: Date;
  updatedAt: Date;
}

export const MMR_MIN = 0;
export const MMR_MAX = 15_000;
/** Seasonal ranked MMR as shown in the client didn't exist before this. */
export const EARLIEST_OBSERVATION = new Date("2013-01-01T00:00:00Z");
