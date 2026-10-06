import { err, ok, type Result } from "@/common/result";

/**
 * A Dota 2 gameplay patch version such as "7.41" or a lettered follow-up such as "7.41f".
 * Ordering: major, then minor, then letter; the unlettered release sorts before "a".
 */
export interface PatchVersion {
  readonly major: number;
  readonly minor: number;
  /** Lowercase letter suffix, or null for the main release. */
  readonly letter: string | null;
  /** Canonical string form, e.g. "7.41f". */
  readonly value: string;
}

export type PatchVersionError = { type: "invalid_patch_version"; input: string };

const PATTERN = /^(\d{1,2})\.(\d{2,3})([a-z])?$/;

export function parsePatchVersion(input: string): Result<PatchVersion, PatchVersionError> {
  const m = PATTERN.exec(input.trim().toLowerCase());
  if (!m) return err({ type: "invalid_patch_version", input });
  const letter = m[3] ?? null;
  return ok({
    major: Number(m[1]),
    minor: Number(m[2]),
    letter,
    // Upstream minors are zero padded ("7.08"); keep that so values match the feed.
    value: `${Number(m[1])}.${m[2]}${letter ?? ""}`,
  });
}

/** Numeric key that sorts like the version (used for storage and cursors). */
export function patchVersionSortKey(v: PatchVersion): number {
  const letterRank = v.letter ? v.letter.charCodeAt(0) - 96 : 0; // a=1 … z=26
  return v.major * 100_000 + v.minor * 100 + letterRank;
}

/** Negative when `a` is older than `b`, positive when newer, 0 when equal. */
export function comparePatchVersions(a: PatchVersion, b: PatchVersion): number {
  return patchVersionSortKey(a) - patchVersionSortKey(b);
}

/** Canonical official page for a version: the attribution link for all patch content. */
export function officialPatchUrl(version: string): string {
  return `https://www.dota2.com/patches/${encodeURIComponent(version)}`;
}
