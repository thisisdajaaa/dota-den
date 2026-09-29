"use client";

import { useMemo, useSyncExternalStore } from "react";
import { GRADE_LABEL, isChallengeType, type ChallengeType, type Grade } from "../domain/challenges";

/** Streaks and recent results, kept on this device only. */
const KEY = "dd_challenge_progress";
const MAX_HISTORY = 20;

export interface ChallengeHistoryEntry {
  type: ChallengeType;
  seed: string;
  grade: Grade;
  /** Hero names the player chose. */
  answer: string[];
  at: string;
}

export interface ChallengeProgress {
  streak: number;
  best: number;
  history: ChallengeHistoryEntry[];
}

const EMPTY: ChallengeProgress = { streak: 0, best: 0, history: [] };

/** Good or better keeps a streak going. */
export function extendsStreak(grade: Grade): boolean {
  return grade === "excellent" || grade === "good";
}

export function parseProgress(raw: string): ChallengeProgress {
  try {
    const value = JSON.parse(raw) as Partial<ChallengeProgress> | null;
    if (!value || typeof value !== "object") return EMPTY;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
    return {
      streak: num(value.streak),
      best: num(value.best),
      history: Array.isArray(value.history)
        ? value.history
            .filter(
              (h): h is ChallengeHistoryEntry =>
                !!h &&
                isChallengeType(h.type) &&
                typeof h.seed === "string" &&
                Object.hasOwn(GRADE_LABEL, h.grade) &&
                Array.isArray(h.answer),
            )
            .slice(0, MAX_HISTORY)
        : [],
    };
  } catch {
    return EMPTY;
  }
}

/** Add a result. Replaying a puzzle you already answered doesn't change the streak. */
export function recordResult(
  progress: ChallengeProgress,
  entry: ChallengeHistoryEntry,
): { progress: ChallengeProgress; counted: boolean } {
  const seen = progress.history.some((h) => h.type === entry.type && h.seed === entry.seed);
  if (seen) return { progress, counted: false };
  const streak = extendsStreak(entry.grade) ? progress.streak + 1 : 0;
  return {
    progress: {
      streak,
      best: Math.max(progress.best, streak),
      history: [entry, ...progress.history].slice(0, MAX_HISTORY),
    },
    counted: true,
  };
}

// localStorage as an external store: the server renders "no progress", the client reads it.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

export function useChallengeProgress(): ChallengeProgress {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "{}");
  return useMemo(() => parseProgress(raw), [raw]);
}

/** Save a result; returns whether it counted toward the streak (false if storage fails). */
export function saveResult(entry: ChallengeHistoryEntry): boolean {
  try {
    const { progress, counted } = recordResult(parseProgress(readRaw()), entry);
    localStorage.setItem(KEY, JSON.stringify(progress));
    // Same-tab writes don't fire "storage"; notify the store ourselves.
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    return counted;
  } catch {
    return false;
  }
}
