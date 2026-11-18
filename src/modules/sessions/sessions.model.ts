import type { SessionNote } from "./domain/session-note";
import type { StopLossSettings } from "./domain/stop-loss";

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
  /** Missing when only a stop-loss was saved: the default gap applies. */
  gapMinutes?: number;
  /** The player's own limits. Missing (every document before stop-loss existed): off. */
  stopLoss?: StopLossSettings;
  /** Set with `stopLoss`: on with at least one rule (indexed, for the session companion). */
  stopLossActive?: boolean;
  updatedAt: Date;
  schemaVersion: number;
}
