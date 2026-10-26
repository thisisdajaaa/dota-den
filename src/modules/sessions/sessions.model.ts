import type { SessionNote } from "./domain/session-note";

export const SESSIONS_SCHEMA_VERSION = 1;
export const SESSION_COLLECTIONS = {
  notes: "session_notes",
  settings: "session_settings",
  /** Session companion (Plus): when each player was last seen in Dota and what's announced. */
  companion: "session_companion",
} as const;

export interface SessionNoteDoc extends SessionNote {
  schemaVersion: number;
  createdAt: Date;
}

export interface SessionSettingsDoc {
  userId: string;
  gapMinutes: number;
  updatedAt: Date;
  schemaVersion: number;
}
