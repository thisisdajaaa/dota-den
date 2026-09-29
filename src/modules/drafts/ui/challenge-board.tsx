"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Info, Loader2, Share2, Shield, Swords, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";
import {
  GRADE_LABEL,
  newSeed,
  type ChallengeInfo,
  type ChallengeResult,
  type Grade,
  type Puzzle,
} from "../domain/challenges";
import { saveResult, useChallengeProgress } from "./challenge-progress";
import { HeroGrid } from "./hero-grid";
import type { DraftHero } from "./types";

const GRADE_STYLE: Record<Grade, string> = {
  excellent: "bg-win/15 text-win ring-win/40",
  good: "bg-gold/15 text-gold ring-gold/40",
  playable: "bg-white/[0.06] text-foreground ring-white/15",
  risky: "bg-loss/15 text-loss ring-loss/40",
};

export function GradeBadge({ grade, className }: { grade: Grade; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        GRADE_STYLE[grade],
        className,
      )}
    >
      {GRADE_LABEL[grade]}
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
        <p className="text-sm text-muted-foreground">No heroes picked yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id} className="flex w-[4.44rem] flex-col items-center gap-1">
              <Portrait hero={heroes.get(id)} id={id} />
              <span className="w-full truncate text-center text-[0.65rem] text-muted-foreground">
                {heroes.get(id)?.name ?? `Hero #${id}`}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, total - ids.length) }, (_, i) => (
            <li
              key={`open-${i}`}
              aria-label="Open slot"
              className="grid h-10 w-[4.44rem] place-items-center rounded-md border border-dashed border-white/15 text-[0.6rem] text-muted-foreground"
            >
              open
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

/** One draft challenge: the position, a hero picker, and the graded result. */
export function ChallengeBoard({
  puzzle,
  info,
  situation,
  heroes,
}: {
  puzzle: Puzzle;
  info: ChallengeInfo;
  /** Plain-language description of the position. */
  situation: string;
  heroes: DraftHero[];
}) {
  const router = useRouter();
  const heroMap = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const unavailable = useMemo(
    () => new Set([...puzzle.yourPicks, ...puzzle.enemyPicks, ...puzzle.bans]),
    [puzzle],
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "choosing" });
  const progress = useChallengeProgress();
  const verb = puzzle.action === "pick" ? "pick" : "ban";
  const name = (id: number) => heroMap.get(id)?.name ?? `Hero #${id}`;

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
      const res = await fetch("/api/v1/drafts/challenges/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: puzzle.type, seed: puzzle.seed, heroIds: selected }),
      });
      const body = (await res.json().catch(() => null)) as
        (ChallengeResult & { error?: undefined }) | { error: { message: string } } | null;
      if (!res.ok || !body || body.error) {
        setStatus({
          kind: "error",
          message: body?.error?.message ?? "Couldn't grade your answer. Please try again.",
        });
        return;
      }
      const result = body as ChallengeResult;
      const counted = saveResult({
        type: puzzle.type,
        seed: puzzle.seed,
        grade: result.grade,
        answer: selected.map(name),
        at: new Date().toISOString(),
      });
      setStatus({ kind: "graded", result, counted });
    } catch {
      setStatus({ kind: "error", message: "Network problem. Check your connection and retry." });
    }
  }

  function nextPuzzle() {
    router.push(`/draft/challenges/${puzzle.type}?seed=${newSeed()}`);
  }

  async function share() {
    const url = `${window.location.origin}/draft/challenges/${puzzle.type}?seed=${puzzle.seed}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Puzzle link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const graded = status.kind === "graded" ? status : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          Streak <span className="font-semibold text-foreground">{progress.streak}</span>
          <span aria-hidden> · </span>
          Best <span className="font-semibold text-foreground">{progress.best}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Puzzle <code className="rounded bg-white/[0.06] px-1">{puzzle.seed}</code>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Lineup title="Your team" ids={puzzle.yourPicks} total={5} heroes={heroMap} tone="you" />
        <Lineup
          title="Enemy team"
          ids={puzzle.enemyPicks}
          total={5}
          heroes={heroMap}
          tone="enemy"
        />
      </div>

      {puzzle.bans.length > 0 && (
        <section aria-label="Banned heroes" className="panel space-y-2 p-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Banned
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
        aria-label="Your task"
        className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold">
            {puzzle.action === "pick" ? (
              <Swords aria-hidden className="size-4 text-gold" />
            ) : (
              <Shield aria-hidden className="size-4 text-gold" />
            )}
            {info.task}
          </h2>
          <p className="text-sm text-muted-foreground">{situation}</p>
        </div>
        {!graded && (
          <div className="flex flex-wrap items-center gap-2">
            <ul aria-label="Your choice" className="flex flex-wrap gap-1.5">
              {selected.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => choose(id)}
                    disabled={status.kind === "grading"}
                    aria-label={`Remove ${name(id)}`}
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
                  <Loader2 aria-hidden className="size-4 animate-spin" /> Grading…
                </>
              ) : puzzle.answerCount === 2 ? (
                `Lock in ${selected.length}/2 bans`
              ) : (
                `Lock in ${verb}`
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
  return (
    <section aria-label="Result" aria-live="polite" className="space-y-4">
      <div className="panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="kicker">Your grade</p>
            <GradeBadge grade={result.grade} className="px-3 py-1 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onShare}>
              <Share2 aria-hidden className="size-4" /> Share this puzzle
            </Button>
            <Button onClick={onNext}>
              Next puzzle <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        </div>

        {result.notice && (
          <p className="flex items-start gap-2 rounded-lg bg-gold/10 p-3 text-sm text-gold">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> {result.notice}
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
                <p className="text-sm">{c.verdict}</p>
                {c.facts.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {c.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!counted && (
          <p className="text-xs text-muted-foreground">
            You&apos;ve answered this puzzle before, so this result doesn&apos;t change your streak.
          </p>
        )}
      </div>

      {result.best.length > 0 && (
        <section aria-label="Best alternatives" className="panel space-y-3 p-4 sm:p-5">
          <h2 className="font-semibold">Strongest options by the numbers</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {result.best.map((b, i) => (
              <li key={b.heroId} className="flex gap-3 rounded-lg bg-white/[0.03] p-3">
                <span className="font-display text-lg text-gold">{i + 1}</span>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Portrait hero={heroes.get(b.heroId)} id={b.heroId} size="sm" />
                    <span className="truncate font-medium">{b.name}</span>
                  </div>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {b.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        {result.disclaimer}{" "}
        <Link
          href="/draft/challenges"
          className="underline underline-offset-2 hover:text-foreground"
        >
          All challenges
        </Link>
      </p>
    </section>
  );
}
