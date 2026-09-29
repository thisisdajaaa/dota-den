"use client";

import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import { CHALLENGE_INFO } from "../domain/challenges";
import { GradeBadge } from "./challenge-board";
import { useChallengeProgress } from "./challenge-progress";

/** Streak, best streak and the last results on this device. */
export function ChallengeHistory() {
  const { streak, best, history } = useChallengeProgress();
  return (
    <section aria-label="Your progress" className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Your progress</h2>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Flame aria-hidden className="size-4 text-gold" /> Streak{" "}
            <strong className="font-semibold">{streak}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy aria-hidden className="size-4 text-gold" /> Best{" "}
            <strong className="font-semibold">{best}</strong>
          </span>
        </div>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No puzzles answered yet. A Good or Excellent answer starts a streak. Results stay on this
          device.
        </p>
      ) : (
        <ol className="divide-y divide-white/[0.06] text-sm">
          {history.map((h) => (
            <li
              key={`${h.type}-${h.seed}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <GradeBadge grade={h.grade} />
              <Link
                href={`/draft/challenges/${h.type}?seed=${h.seed}`}
                className="font-medium hover:text-gold hover:underline"
              >
                {CHALLENGE_INFO[h.type]?.title ?? h.type}
              </Link>
              <span className="min-w-0 truncate text-muted-foreground">{h.answer.join(", ")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
