import Link from "next/link";
import { ChevronRight, NotebookPen, Target } from "lucide-react";
import { cn } from "cn";
import type { Messages } from "@/common/i18n/messages";
import { getT } from "@/common/i18n/server";
import { plural, type Translator } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import type { PlaySession } from "../domain/session";
import { formatSpan, sessionTimeLabels } from "../domain/session-labels";
import type { SessionMmr } from "../domain/session-mmr";
import type { SessionNote } from "../domain/session-note";
import { MmrChangeBadge } from "./mmr-change-badge";

const MAX_HEROES = 5;

export interface SessionListItem {
  session: PlaySession;
  mmr: SessionMmr;
  note: SessionNote | null;
}

/** "W–L" with colour and words, so the record reads without colour too. */
export async function SessionRecord({
  wins,
  losses,
  className,
}: {
  wins: number;
  losses: number;
  className?: string;
}) {
  const t = await getT();
  return (
    <span
      className={cn("font-semibold tabular-nums", className)}
      aria-label={t("sessions.record.aria", {
        wins: plural(t, "sessions.record.wins", wins),
        losses: plural(t, "sessions.record.losses", losses),
      })}
    >
      <span className="text-win">{wins}W</span>
      <span className="text-muted-foreground">–</span>
      <span className="text-loss">{losses}L</span>
    </span>
  );
}

/** "3 solo · 2 party · 1 unknown", skipping zeros. */
export function queueMix(
  t: Translator<Messages>,
  q: { solo: number; party: number; unknown: number },
): string {
  return (
    [
      q.solo && t("sessions.queue.solo", { n: q.solo }),
      q.party && t("sessions.queue.party", { n: q.party }),
      q.unknown && t("sessions.queue.unknown", { n: q.unknown }),
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

export async function SessionList({
  items,
  heroes,
  timeZone,
}: {
  items: SessionListItem[];
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const t = await getT();
  return (
    <ul className="divide-y divide-white/[0.05]">
      {items.map(({ session, mmr, note }) => {
        const labels = sessionTimeLabels(session.startedAt, session.endedAt, timeZone);
        const s = session.stats;
        const shown = s.heroes.slice(0, MAX_HEROES);
        const hasNote = note !== null && note.note.length > 0;
        const hasGoal = note !== null && note.goal.length > 0;
        return (
          <li key={session.id}>
            <Link
              href={`/sessions/${session.id}`}
              aria-label={t("sessions.item.aria", {
                date: labels.date,
                time: labels.timeRange,
                wins: s.wins,
                losses: s.losses,
              })}
              className="group relative grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04] focus-visible:outline-none sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-3 left-0 w-0.5 rounded-r",
                  s.wins > s.losses ? "bg-win" : s.wins < s.losses ? "bg-loss" : "bg-unknown",
                )}
              />
              <span className="min-w-0 space-y-1">
                <span className="block font-medium">{labels.date}</span>
                <span className="block text-xs text-muted-foreground">
                  {labels.timeRange} · {formatSpan(s.spanSec)} ·{" "}
                  {plural(t, "sessions.item.games", s.games)}
                </span>
                <span className="flex flex-wrap items-center gap-2 pt-0.5">
                  <SessionRecord wins={s.wins} losses={s.losses} />
                  <MmrChangeBadge mmr={mmr} />
                  {hasGoal && (
                    <span className="inline-flex items-center gap-1 text-xs text-gold">
                      <Target aria-hidden className="size-3.5" />
                      {note?.goalMet === "yes"
                        ? t("sessions.item.goalMet")
                        : note?.goalMet === "partly"
                          ? t("sessions.item.goalPartly")
                          : note?.goalMet === "no"
                            ? t("sessions.item.goalMissed")
                            : t("sessions.item.goalSet")}
                    </span>
                  )}
                  {hasNote && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <NotebookPen aria-hidden className="size-3.5" />
                      {t("sessions.item.notes")}
                    </span>
                  )}
                </span>
              </span>

              <span className="min-w-0 space-y-1.5">
                <span className="flex flex-wrap gap-1" aria-label={t("sessions.item.heroesPlayed")}>
                  {shown.map((h) => (
                    <span
                      key={h.heroId}
                      title={`${heroName(heroes.get(h.heroId), h.heroId)} ×${h.games}`}
                    >
                      <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="xs" />
                      <span className="sr-only">
                        {t("sessions.item.heroGames", {
                          hero: heroName(heroes.get(h.heroId), h.heroId),
                          games: plural(t, "sessions.item.games", h.games),
                        })}
                      </span>
                    </span>
                  ))}
                  {s.heroes.length > MAX_HEROES && (
                    <span className="self-center text-xs text-muted-foreground">
                      +{s.heroes.length - MAX_HEROES}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">{queueMix(t, s.queue)}</span>
              </span>

              <ChevronRight
                aria-hidden
                className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold sm:block"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
