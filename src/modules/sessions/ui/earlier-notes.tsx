import Link from "next/link";
import { NotebookPen } from "lucide-react";
import type { EarlierNote, GoalMet } from "../domain/session-note";

const GOAL_MET_LABEL: Record<GoalMet, string> = {
  yes: "Goal met",
  partly: "Goal partly met",
  no: "Goal missed",
};

function dateLabel(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/**
 * Notes saved when games were grouped with a different break length. Shown as they were
 * written (read-only), dated by the session they were saved on, and linked to the session
 * that now holds those games.
 */
export function EarlierNotes({
  items,
  timeZone,
  linkToSession = true,
}: {
  items: EarlierNote[];
  timeZone: string;
  linkToSession?: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map(({ note, currentSessionId }) => (
        <li
          key={note.sessionId}
          className="space-y-1.5 rounded-lg border border-dashed border-white/[0.1] bg-white/[0.02] p-3"
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <NotebookPen aria-hidden className="size-3.5" />
            <span>Saved for the session starting {dateLabel(note.sessionStartedAt, timeZone)}</span>
          </p>
          {note.goal && (
            <p className="text-sm">
              <span className="text-muted-foreground">Goal: </span>
              {note.goal}
              {note.goalMet && (
                <span className="ml-2 text-xs text-gold">{GOAL_MET_LABEL[note.goalMet]}</span>
              )}
            </p>
          )}
          {note.note && (
            <p className="text-sm whitespace-pre-line text-muted-foreground">{note.note}</p>
          )}
          {linkToSession &&
            (currentSessionId ? (
              <Link
                href={`/sessions/${currentSessionId}`}
                className="text-xs text-gold hover:underline"
              >
                Open the session these games are in now
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">
                Those games are no longer in your imported history.
              </p>
            ))}
        </li>
      ))}
    </ul>
  );
}
