import { type GapMinutes, type PlaySession, type SessionMatch } from "../../domain/session";
import { type SessionMmr } from "../../domain/session-mmr";
import { type EarlierNote, type SessionNote } from "../../domain/session-note";

export interface SessionView<M extends SessionMatch = SessionMatch> {
  session: PlaySession<M>;
  mmr: SessionMmr;
}

export interface SessionsPage<M extends SessionMatch = SessionMatch> {
  gapMinutes: GapMinutes;
  /** Imported matches on the account (0 means nothing synced yet). */
  totalMatches: number;
  items: Array<SessionView<M> & { note: SessionNote | null }>;
  totalSessions: number;
  page: number;
  pageCount: number;
  /** Notes whose session no longer exists under the current break length (newest first). */
  earlierNotes: EarlierNote[];
}

export interface SessionDetail<M extends SessionMatch = SessionMatch> extends SessionView<M> {
  gapMinutes: GapMinutes;
  note: SessionNote | null;
  /** Notes saved when this session's games were grouped differently (read-only). */
  earlierNotes: SessionNote[];
  /** Neighbouring sessions for prev/next navigation. */
  olderId: string | null;
  newerId: string | null;
}

export type SessionError = { type: "not_found" };
