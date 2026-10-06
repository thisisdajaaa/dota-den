/** Tag and note rules for your match annotations (pure). Private to you, like session notes. */

export const MAX_TAGS = 6;
export const MAX_TAG_LENGTH = 20;
export const MAX_NOTE_LENGTH = 500;
/** Quick picks offered on the match page; any other tag can be typed. */
export const SUGGESTED_TAGS = [
  "tilted",
  "griefer",
  "smurf",
  "new build",
  "comeback",
  "stomped",
  "good teamwork",
  "bad draft",
] as const;

/** "Good  Teamwork!" → "good teamwork": lower case, letters, digits, spaces and dashes only. */
export function normalizeTag(raw: string): string | null {
  const t = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
  return t.length > 0 ? t : null;
}

/** Normalized, de-duplicated tags, at most MAX_TAGS. */
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
