"use client";

import { apiRequest, errorMessage } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Info, Loader2, Share2, Shield, Swords, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";
import { newSeed, type ChallengeResult, type Grade, type Puzzle } from "../domain/challenges";
import { saveResult, useChallengeProgress } from "./challenge-progress";
import { HeroGrid } from "./hero-grid";
import { actionName, sayOr } from "./i18n";
import type { DraftHero } from "./types";

const GRADE_STYLE: Record<Grade, string> = {
  excellent: "bg-win/15 text-win ring-win/40",
  good: "bg-gold/15 text-gold ring-gold/40",
  playable: "bg-white/[0.06] text-foreground ring-white/15",
  risky: "bg-loss/15 text-loss ring-loss/40",
};

export function GradeBadge({ grade, className }: { grade: Grade; className?: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        GRADE_STYLE[grade],
        className,
      )}
    >
      {t(`drafts.challenge.grades.${grade}`)}
    </span>
  );
}

function Portrait({
  hero,
  id,
  size = "md",
}: {
  hero: DraftHero | undefined;
  id: number;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <HeroPortrait hero={hero ? { ...hero, renderUrl: null } : undefined} heroId={id} size={size} />
  );
}

function Lineup({
  title,
  ids,
  total,
  heroes,
  tone,
}: {
  title: string;
  ids: readonly number[];
  total: number;
  heroes: Map<number, DraftHero>;
  tone: "you" | "enemy";
}) {
  const t = useT();
  return (
    <section
      aria-label={title}
      className={cn("panel space-y-2 p-4", tone === "you" ? "border-win/30" : "border-loss/30")}
    >
      <h2
        className={cn(
          "text-sm font-semibold tracking-wide uppercase",
          tone === "you" ? "text-win" : "text-loss",
        )}
      >
        {title}
      </h2>
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("drafts.challenge.noPicks")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id} className="flex w-[4.44rem] flex-col items-center gap-1">
              <Portrait hero={heroes.get(id)} id={id} />
              <span className="w-full truncate text-center text-[0.65rem] text-muted-foreground">
                {heroes.get(id)?.name ?? t("drafts.challenge.hero", { id })}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, total - ids.length) }, (_, i) => (
            <li
              key={`open-${i}`}
              aria-label={t("drafts.challenge.openSlot")}
              className="grid h-10 w-[4.44rem] place-items-center rounded-md border border-dashed border-white/15 text-[0.6rem] text-muted-foreground"
            >
              {t("drafts.challenge.open")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Status =
  | { kind: "choosing" }
  | { kind: "grading" }
  | { kind: "error"; message: string }
  | { kind: "graded"; result: ChallengeResult; counted: boolean };

/** Your streak as saved on your account (signed in); guests use this device's progress. */
export interface SavedStreak {
  streak: number;
  best: number;
}

/** One draft challenge: the position, a hero picker, and the graded result. */
export function ChallengeBoard({
  puzzle,
  situation,
  heroes,
  saved: savedInitial = null,
}: {
  puzzle: Puzzle;
  /** Plain-language description of the position. */
  situation: string;
  heroes: DraftHero[];
  /** Signed in: the streak saved on your account. */
  saved?: SavedStreak | null;
}) {
  const t = useT();
  const router = useRouter();
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const unavailable = useMemo(
    () => new Set([...puzzle.yourPicks, ...puzzle.enemyPicks, ...puzzle.bans]),
    [puzzle],
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "choosing" });
  const local = useChallengeProgress();
  const [saved, setSaved] = useState<SavedStreak | null>(savedInitial);
  const progress = saved ?? local;
  const verb = actionName(t, puzzle.action);
  const name = (id: number) => heroMap.get(id)?.name ?? t("drafts.challenge.hero", { id });

  function choose(id: number) {
    if (status.kind === "grading" || status.kind === "graded") return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Keep the most recent choices up to the answer size.
      return [...prev, id].slice(-puzzle.answerCount);
    });
    if (status.kind === "error") setStatus({ kind: "choosing" });
  }

  async function submit() {
    if (selected.length !== puzzle.answerCount) return;
    setStatus({ kind: "grading" });
    try {
      let body: ChallengeResult & { saved?: (SavedStreak & { counted: boolean }) | null };
      try {
        body = await apiRequest("/api/v1/drafts/challenges/grade", {
          method: "POST",
          body: { type: puzzle.type, seed: puzzle.seed, heroIds: selected },
        });
      } catch (e) {
        setStatus({
          kind: "error",
          message: errorMessage(e, t("drafts.challenge.gradeFailed")),
        });
        return;
      }
      const result = body as ChallengeResult;
      const account = "saved" in body ? (body.saved ?? null) : null;
      const countedHere = saveResult({
        type: puzzle.type,
        seed: puzzle.seed,
        grade: result.grade,
        answer: selected.map(name),
        at: new Date().toISOString(),
      });
      // Signed in, the account's streak is the one that counts.
      if (account) setSaved({ streak: account.streak, best: account.best });
      setStatus({ kind: "graded", result, counted: account ? account.counted : countedHere });
    } catch {
      setStatus({ kind: "error", message: t("drafts.challenge.network") });
    }
  }

  function nextPuzzle() {
    router.push(`/draft/challenges/${puzzle.type}?seed=${newSeed()}`);
  }

  async function share() {
    const url = `${window.location.origin}/draft/challenges/${puzzle.type}?seed=${puzzle.seed}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("drafts.challenge.linkCopied"));
    } catch {
      toast.error(t("drafts.challenge.copyFailed"));
    }
  }

  const graded = status.kind === "graded" ? status : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          {t("drafts.challenge.streak")}{" "}
          <span className="font-semibold text-foreground">{progress.streak}</span>
          <span aria-hidden> · </span>
          {t("drafts.challenge.best")}{" "}
          <span className="font-semibold text-foreground">{progress.best}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("drafts.challenge.puzzle")}{" "}
          <code className="rounded bg-white/[0.06] px-1">{puzzle.seed}</code>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Lineup
          title={t("drafts.challenge.yourTeam")}
          ids={puzzle.yourPicks}
          total={5}
          heroes={heroMap}
          tone="you"
        />
        <Lineup
          title={t("drafts.challenge.enemyTeam")}
          ids={puzzle.enemyPicks}
          total={5}
          heroes={heroMap}
          tone="enemy"
        />
      </div>

      {puzzle.bans.length > 0 && (
        <section aria-label={t("drafts.challenge.bannedLabel")} className="panel space-y-2 p-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t("drafts.challenge.banned")}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {puzzle.bans.map((id) => (
              <li key={id} title={name(id)} className="opacity-70 grayscale">
                <Portrait hero={heroMap.get(id)} id={id} size="sm" />
                <span className="sr-only">{name(id)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-label={t("drafts.challenge.task")}
        className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold">
            {puzzle.action === "pick" ? (
              <Swords aria-hidden className="size-4 text-gold" />
            ) : (
              <Shield aria-hidden className="size-4 text-gold" />
            )}
            {t(`drafts.challenge.types.${puzzle.type}.task`)}
          </h2>
          <p className="text-sm text-muted-foreground">{situation}</p>
        </div>
        {!graded && (
          <div className="flex flex-wrap items-center gap-2">
            <ul aria-label={t("drafts.challenge.choice")} className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => choose(id)}
                    disabled={status.kind === "grading"}
                    aria-label={t("drafts.challenge.remove", { hero: name(id) })}
                    className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold ring-1 ring-gold/40 hover:bg-gold/25 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {name(id)} <X aria-hidden className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              onClick={submit}
              disabled={selected.length !== puzzle.answerCount || status.kind === "grading"}
            >
              {status.kind === "grading" ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />{" "}
                  {t("drafts.challenge.grading")}
                </>
              ) : puzzle.answerCount === 2 ? (
                t("drafts.challenge.lockBans", { n: selected.length })
              ) : puzzle.action === "pick" ? (
                t("drafts.challenge.lockPick")
              ) : (
                t("drafts.challenge.lockBan")
              )}
            </Button>
          </div>
        )}
      </section>

      {status.kind === "error" && (
        <p role="alert" className="panel border-loss/40 p-3 text-sm text-loss">
          {status.message}
        </p>
      )}

      {graded ? (
        <ResultPanel
          result={graded.result}
          counted={graded.counted}
          heroes={heroMap}
          onNext={nextPuzzle}
          onShare={share}
        />
      ) : (
        <HeroGrid
          heroes={heroes}
          unavailable={unavailable}
          disabled={false}
          actionLabel={verb}
          onChoose={choose}
        />
      )}
    </div>
  );
}

function ResultPanel({
  result,
  counted,
  heroes,
  onNext,
  onShare,
}: {
  result: ChallengeResult;
  counted: boolean;
  heroes: Map<number, DraftHero>;
  onNext: () => void;
  onShare: () => void;
}) {
  const t = useT();
  return (
    <section aria-label={t("drafts.challenge.result")} aria-live="polite" className="space-y-4">
      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="kicker">{t("drafts.challenge.yourGrade")}</p>
            <GradeBadge grade={result.grade} className="px-3 py-1 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onShare}>
              <Share2 aria-hidden className="size-4" /> {t("drafts.challenge.share")}
            </Button>
            <Button onClick={onNext}>
              {t("drafts.challenge.next")} <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </div>

        {result.notice && (
          <p className="flex items-start gap-2 rounded-lg bg-gold/10 p-3 text-sm text-gold">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />{" "}
            {result.basis === "role_fit" ? t("drafts.challenge.roleFitNotice") : result.notice}
          </p>
        )}

        <ul className="space-y-3">
          {result.choices.map((c) => (
            <li key={c.heroId} className="flex gap-3">
              <Portrait hero={heroes.get(c.heroId)} id={c.heroId} size="lg" />
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {c.name} <GradeBadge grade={c.grade} />
                </p>
                <p className="text-sm">{sayOr(t, c.verdictPhrase, c.verdict)}</p>
                {c.facts.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {c.facts.map((f, i) => (
                      <li key={f}>{sayOr(t, c.factPhrases?.[i], f)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!counted && (
          <p className="text-xs text-muted-foreground">{t("drafts.challenge.notCounted")}</p>
        )}
      </div>

      {result.best.length > 0 && (
        <section
          aria-label={t("drafts.challenge.alternatives")}
          className="panel space-y-3 p-4 sm:p-5"
        >
          <h2 className="font-semibold">{t("drafts.challenge.strongest")}</h2>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {result.best.map((b, i) => (
              <li key={b.heroId} className="flex gap-3 rounded-lg bg-white/[0.03] p-3">
                <span className="font-display text-lg text-gold">{i + 1}</span>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Portrait hero={heroes.get(b.heroId)} id={b.heroId} size="sm" />
                    <span className="truncate font-medium">{b.name}</span>
                  </div>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {b.facts.map((f, i) => (
                      <li key={f}>{sayOr(t, b.factPhrases?.[i], f)}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        {t("drafts.challenge.disclaimer")}{" "}
        <Link
          href="/draft/challenges"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t("drafts.challenge.all")}
        </Link>
      </p>
    </section>
  );
}
