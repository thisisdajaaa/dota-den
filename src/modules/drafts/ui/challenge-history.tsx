"use client";

import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import { useT } from "@/common/i18n/client";
import { isChallengeType } from "../domain/challenges";
import { GradeBadge, type SavedStreak } from "./challenge-board";
import { useChallengeProgress } from "./challenge-progress";

/**
 * Streak, best streak and the last results on this device. Signed in, the streak shown is
 * the one saved on your account (`saved`).
 */
export function ChallengeHistory({ saved = null }: { saved?: SavedStreak | null }) {
  const t = useT();
  const local = useChallengeProgress();
  const { history } = local;
  const { streak, best } = saved ?? local;
  return (
    <section aria-label={t("drafts.progress.label")} className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("drafts.progress.title")}</h2>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Flame aria-hidden className="size-4 text-gold" /> {t("drafts.progress.streak")}{" "}
            <strong className="font-semibold">{streak}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy aria-hidden className="size-4 text-gold" /> {t("drafts.progress.best")}{" "}
            <strong className="font-semibold">{best}</strong>
          </span>
        </div>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("drafts.progress.empty")}{" "}
          {saved ? t("drafts.progress.savedAccount") : t("drafts.progress.deviceOnly")}
        </p>
      ) : (
        <>
          {saved && (
            <p className="text-xs text-muted-foreground">{t("drafts.progress.savedList")}</p>
          )}
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
                  {isChallengeType(h.type) ? t(`drafts.challenge.types.${h.type}.title`) : h.type}
                </Link>
                <span className="min-w-0 truncate text-muted-foreground">
                  {h.answer.join(", ")}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
