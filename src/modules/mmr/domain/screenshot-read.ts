/**
 * Reading an MMR from a screenshot (pure parts). The model's answer is only a suggestion:
 * the player confirms or corrects it before anything is saved.
 */

export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface ScreenshotRead {
  /** The player's MMR as shown, or null when none is visible. */
  mmr: number | null;
  /** Where on the screen it was read, in a few words (shown to the player). */
  seen: string | null;
}

/** Parse and sanity-check the model's JSON reply. Anything odd becomes "not found". */
export function parseScreenshotAnswer(content: string | null | undefined): ScreenshotRead {
  if (!content) return { mmr: null, seen: null };
  // Reasoning models may wrap the JSON in thinking or prose: take the last JSON object.
  const matches = content.replace(/<think>[\s\S]*?<\/think>/g, "").match(/\{[^{}]*\}/g);
  const json = matches?.at(-1);
  if (!json) return { mmr: null, seen: null };
  try {
    const raw = JSON.parse(json) as { mmr?: unknown; seen?: unknown };
    const n =
      typeof raw.mmr === "number"
        ? raw.mmr
        : typeof raw.mmr === "string"
          ? Number(raw.mmr.replace(/[,\s]/g, ""))
          : NaN;
    const mmr = Number.isInteger(n) && n >= 0 && n <= 15_000 ? n : null;
    const seen =
      typeof raw.seen === "string" && raw.seen.trim() ? raw.seen.trim().slice(0, 120) : null;
    return { mmr, seen: mmr === null ? null : seen };
  } catch {
    return { mmr: null, seen: null };
  }
}
