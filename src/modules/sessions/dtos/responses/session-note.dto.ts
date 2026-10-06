import type { SessionNote } from "../../domain/session-note";

export interface SessionNoteDto {
  sessionId: string;
  note: string;
  goal: string;
  goalMet: SessionNote["goalMet"];
  updatedAt: string;
}

/** Never exposes the owner's user id. */
export function toSessionNoteDto(n: SessionNote): SessionNoteDto {
  return {
    sessionId: n.sessionId,
    note: n.note,
    goal: n.goal,
    goalMet: n.goalMet,
    updatedAt: n.updatedAt.toISOString(),
  };
}
