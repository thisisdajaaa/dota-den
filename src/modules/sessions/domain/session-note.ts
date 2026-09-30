import { parseSessionId } from "./session";

/** A user's own notes and goal for one play session. Private to that user. */
export const GOAL_MET_VALUES = ["yes", "no", "partly"] as const;
export type GoalMet = (typeof GOAL_MET_VALUES)[number];

export const NOTE_MAX = 1000;
export const GOAL_MAX = 200;

export interface SessionNote {
  userId: string;
  accountId32: number;
  sessionId: string;
  /** The session's matches when the note was saved (spec §7: session_notes keep matchIds). */
  matchIds: string[];
  /** When that session started (raw first-match timestamp), to date the note on its own. */
  sessionStartedAt: Date;
  note: string;
  goal: string;
  goalMet: GoalMet | null;
  updatedAt: Date;
}

export const hasContent = (n: Pick<SessionNote, "note" | "goal">): boolean =>
  n.note.length > 0 || n.goal.length > 0;

/** A note saved under a session id that the current grouping no longer produces. */
export interface EarlierNote {
  note: SessionNote;
  /** The current session that now contains the note's first match, if it is still imported. */
  currentSessionId: string | null;
}

/**
 * Notes are keyed by `${accountId32}:${firstMatchId}`. Changing the break length can regroup
 * games so a note's first match is no longer first in its session. Such notes are never
 * rewritten or merged; they are placed next to the session that now holds that match.
 */
export function placeEarlierNotes(
  notes: readonly SessionNote[],
  sessions: ReadonlyArray<{ id: string; matches: ReadonlyArray<{ matchId: string }> }>,
): EarlierNote[] {
  const current = new Set(sessions.map((s) => s.id));
  const sessionOfMatch = new Map<string, string>();
  for (const s of sessions) for (const m of s.matches) sessionOfMatch.set(m.matchId, s.id);
  return notes
    .filter((n) => !current.has(n.sessionId) && hasContent(n))
    .map((n) => {
      const first = parseSessionId(n.sessionId)?.firstMatchId;
      return { note: n, currentSessionId: (first && sessionOfMatch.get(first)) || null };
    });
}
