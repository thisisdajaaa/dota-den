import type { GroundFact } from "@/common/utils/grounding";
import type { CoachNote } from "../../domain/weekly-coach";
import type { StoredCoachNote } from "../../report.ports";

/** A weekly coach note, as the report page shows it. */
export interface CoachNoteDto {
  /** The week's Monday ("2026-11-09"); the week runs to the Sunday after. */
  week: string;
  /** The language it was written in (en, fil or ceb). */
  locale: string;
  note: CoachNote;
  /** The facts it was written from (listed under the note). */
  facts: GroundFact[];
  createdAt: string;
}

/** The weekly coach card's state before anything is written. */
export type WeeklyCoachInitial =
  | { status: "off" }
  /** Free players: what the note is, never the note itself. */
  | { status: "not_plus"; week: string }
  /** Plus, nothing written yet for this week (e.g. Plus started after Monday). */
  | { status: "available"; week: string }
  | { status: "ready"; note: CoachNoteDto };

export function toCoachNoteDto(n: StoredCoachNote): CoachNoteDto {
  return {
    week: n.week,
    locale: n.locale,
    note: n.note,
    facts: n.facts,
    createdAt: n.createdAt.toISOString(),
  };
}

/** What POST /api/v1/report/weekly-coach answers. */
export type WeeklyCoachWriteDto =
  { status: "written" | "cached"; note: CoachNoteDto } | { status: "no_games"; week: string };
