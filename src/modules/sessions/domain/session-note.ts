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
  note: string;
  goal: string;
  goalMet: GoalMet | null;
  updatedAt: Date;
}

export const hasContent = (n: Pick<SessionNote, "note" | "goal">): boolean =>
  n.note.length > 0 || n.goal.length > 0;
