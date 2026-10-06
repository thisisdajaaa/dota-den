import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { getT } from "@/common/i18n/server";
import type { EarlierNote, GoalMet } from "../domain/session-note";

const GOAL_MET_KEY = {
  yes: "sessions.item.goalMet",
  partly: "sessions.item.goalPartly",
  no: "sessions.item.goalMissed",
} as const satisfies Record<GoalMet, string>;

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
export async function EarlierNotes({
  items,
  timeZone,
  linkToSession = true,
}: {
  items: EarlierNote[];
  timeZone: string;
  linkToSession?: boolean;
}) {
  const t = await getT();
  return (
    <ul className="space-y-3">
      {items.map(({ note, currentSessionId }) => (
        <li
          key={note.sessionId}
          className="space-y-1.5 rounded-lg border border-dashed border-white/[0.1] bg-white/[0.02] p-3"
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <NotebookPen aria-hidden className="size-3.5" />
            <span>
              {t("sessions.earlier.savedFor", {
                date: dateLabel(note.sessionStartedAt, timeZone),
              })}
            </span>
          </p>
          {note.goal && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t("sessions.earlier.goal")}</span>
              {note.goal}
              {note.goalMet && (
                <span className="ml-2 text-xs text-gold">{t(GOAL_MET_KEY[note.goalMet])}</span>
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
                {t("sessions.earlier.openSession")}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">{t("sessions.earlier.gone")}</p>
            ))}
        </li>
      ))}
    </ul>
  );
}
