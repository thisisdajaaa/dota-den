"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, Loader2, Target } from "lucide-react";
import { useT } from "@/common/i18n/client";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { addDays } from "@/common/time/day-key";
import { clock, type GroundFact } from "@/common/utils/grounding";
import { Button } from "@/components/ui/button";
import type {
  CoachNoteDto,
  WeeklyCoachInitial,
  WeeklyCoachWriteDto,
} from "../dtos/responses/weekly-coach.dto";

type State = WeeklyCoachInitial | { status: "no_games"; week: string };

const short = (k: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${k}T12:00:00Z`),
  );
/** "Nov 9 – Nov 15" for the week starting on that Monday. */
export const weekRangeLabel = (week: string) => `${short(week)} – ${short(addDays(week, 6))}`;

const factValue = (f: GroundFact) =>
  typeof f.value === "string"
    ? f.value
    : f.unit === "clock"
      ? clock(f.value)
      : f.unit === "percent"
        ? `${f.value}%`
        : f.value.toLocaleString("en-US");

/**
 * The Monday AI weekly coach (Plus): last week's note with its one fix, and the facts it was
 * written from. Free players see what it is (a hidden preview and the Plus link), never a note.
 */
export function WeeklyCoachCard({ initial }: { initial: WeeklyCoachInitial }) {
  const t = useT();
  const [state, setState] = useState<State>(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (state.status === "off") return null;
  const week = state.status === "ready" ? state.note.week : state.week;

  async function write() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiRequest<WeeklyCoachWriteDto>("/api/v1/report/weekly-coach", {
        method: "POST",
        body: { week },
      });
      setState(
        res.status === "no_games"
          ? { status: "no_games", week: res.week }
          : { status: "ready", note: res.note },
      );
    } catch (e) {
      const reason =
        e instanceof ApiClientError ? (e.details as { reason?: string } | undefined)?.reason : null;
      setProblem(
        reason === "resting"
          ? t("report.coach.resting")
          : reason === "failed"
            ? t("report.coach.failed")
            : reason === "unavailable" || reason === "games_unavailable"
              ? t("report.coach.unavailable")
              : e instanceof ApiClientError
                ? e.message
                : t("report.coach.offline"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="weekly-coach"
      aria-labelledby="weekly-coach-title"
      className="panel scroll-mt-24 space-y-4 p-5"
    >
      <div>
        <p className="kicker flex items-center gap-1.5">
          <CalendarCheck aria-hidden className="size-3.5" /> {t("report.coach.kicker")}
        </p>
        <h2 id="weekly-coach-title" className="text-lg font-semibold">
          {t("report.coach.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("report.coach.week", { range: weekRangeLabel(week) })}
        </p>
      </div>

      {state.status === "not_plus" && (
        <div className="space-y-3">
          {/* A shape of a note, no words or numbers: the note itself is for Plus. */}
          <div
            role="img"
            aria-label={t("report.coach.previewLabel")}
            className="space-y-2 rounded-lg border border-white/[0.06] p-3 opacity-60 blur-[1px] select-none"
          >
            <div className="h-3 w-2/3 rounded bg-white/15" />
            <div className="h-2.5 w-full rounded bg-white/10" />
            <div className="h-2.5 w-11/12 rounded bg-white/10" />
            <div className="h-2.5 w-4/5 rounded bg-white/10" />
            <div className="mt-3 h-6 w-1/2 rounded bg-gold/20" />
          </div>
          <p className="text-sm">
            {t("report.coach.pitch")}{" "}
            <Link href="/plus" className="font-medium text-gold hover:underline">
              {t("report.coach.seePlus")}
            </Link>
          </p>
        </div>
      )}

      {state.status === "available" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("report.coach.notYet", { range: weekRangeLabel(week) })}
          </p>
          <Button onClick={write} disabled={busy}>
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {busy ? t("report.coach.writing") : t("report.coach.write")}
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-loss">
              {problem}
            </p>
          )}
        </div>
      )}

      {state.status === "no_games" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("report.coach.noGames")}
        </p>
      )}

      {state.status === "ready" && <Note note={state.note} />}

      <p className="text-xs text-muted-foreground">{t("report.coach.about")}</p>
    </section>
  );
}

function Note({ note }: { note: CoachNoteDto }) {
  const t = useT();
  const facts = (keys: readonly string[]) =>
    keys
      .map((k) => note.facts.find((f) => f.key === k))
      .filter((f): f is GroundFact => f !== undefined);
  return (
    <article lang={note.locale} className="space-y-3">
      <h3 className="font-semibold">{note.note.headline}</h3>
      {note.note.paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed">
          {p}
        </p>
      ))}
      <Chips list={facts(note.note.factKeys)} label={t("report.coach.basedOn")} />
      <div
        role="group"
        aria-label={t("report.coach.fix")}
        className="space-y-1.5 rounded-lg border border-gold/30 bg-gold/[0.06] p-3"
      >
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-gold uppercase">
          <Target aria-hidden className="size-3.5" /> {t("report.coach.fix")}
        </p>
        <p className="font-medium">{note.note.fix.title}</p>
        <p className="text-sm text-muted-foreground">{note.note.fix.detail}</p>
        <Chips list={facts(note.note.fix.factKeys)} label={t("report.coach.basedOn")} />
      </div>
    </article>
  );
}

function Chips({ list, label }: { list: GroundFact[]; label: string }) {
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {list.map((f) => (
        <li key={f.key} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-xs tabular-nums">
          {f.label}: {factValue(f)}
        </li>
      ))}
    </ul>
  );
}
