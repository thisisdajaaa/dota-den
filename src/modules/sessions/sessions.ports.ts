import type { GapMinutes, SessionMatch } from "./domain/session";
import type { MmrObservation } from "./domain/session-mmr";
import type { SessionNote } from "./domain/session-note";

export interface SessionOwner {
  userId: string;
  accountId32: number;
}

/** The account's imported matches (all game types). Adapted from Match Intelligence. */
export interface SessionMatchSource<M extends SessionMatch = SessionMatch> {
  listMatches(accountId32: number): Promise<M[]>;
}

/** The user's own MMR entries for one account. Adapted from the MMR journal. */
export interface MmrObservationSource {
  list(owner: SessionOwner): Promise<MmrObservation[]>;
}

export interface SessionNotesPort {
  /** Insert or replace the owner's note for one session. Unique on (userId, sessionId). */
  upsert(note: SessionNote): Promise<SessionNote>;
  /** Scoped by owner: another user's note is never returned. */
  get(userId: string, sessionId: string): Promise<SessionNote | null>;
  /** The owner's notes for these sessions (missing ones are simply absent). */
  listForSessions(userId: string, sessionIds: readonly string[]): Promise<SessionNote[]>;
  /** The owner's notes for one account, most recently edited first. */
  listRecent(userId: string, accountId32: number, limit: number): Promise<SessionNote[]>;
}

export interface SessionSettingsPort {
  getGap(userId: string): Promise<GapMinutes | null>;
  setGap(userId: string, gapMinutes: GapMinutes, now: Date): Promise<void>;
}

/** A store of the player's own data, for "Download your data" and account deletion. */
export interface PersonalDataStore {
  exportForOwner(owner: SessionOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: SessionOwner): Promise<number>;
}
