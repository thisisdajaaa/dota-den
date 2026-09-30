/**
 * "How this patch affects you" (pure): which of your heroes a patch changed, the first
 * lines of what changed, and your ranked record on each hero before vs since the patch.
 */
import type { HeroPatchNotes, Patch } from "./patch";

/** Games on each side before a before/since comparison is shown. */
export const MIN_COHORT_GAMES = 5;
/** How far before and after the patch the comparison looks. */
export const COHORT_WINDOW_MS = 30 * 86_400_000;

export interface Record {
  games: number;
  wins: number;
}

export interface HeroCohort {
  before: Record;
  after: Record;
}

export interface DigestHero {
  heroId: number;
  /** The first few changes, in Valve's wording. */
  highlights: string[];
  /** All the changes listed for this hero (hero, ability and talent notes). */
  noteCount: number;
  cohort: HeroCohort;
  /** before/since win-rate difference; null below MIN_COHORT_GAMES on either side. */
  delta: number | null;
}

export interface PatchDigest {
  version: string;
  name: string;
  publishedAt: Date;
  heroes: DigestHero[];
}

/** Your ranked record on a hero in the windows before and since `released`. */
export function heroCohort(
  results: readonly { heroId: number; startedAt: Date; result: "win" | "loss" }[],
  heroId: number,
  released: Date,
): HeroCohort {
  const cohort: HeroCohort = { before: { games: 0, wins: 0 }, after: { games: 0, wins: 0 } };
  for (const m of results) {
    if (m.heroId !== heroId) continue;
    const side = m.startedAt.getTime() < released.getTime() ? cohort.before : cohort.after;
    side.games++;
    if (m.result === "win") side.wins++;
  }
  return cohort;
}

function highlights(h: HeroPatchNotes, max: number): { lines: string[]; count: number } {
  const lines = [
    ...h.heroNotes.map((n) => n.text),
    ...h.abilities.flatMap((a) =>
      a.notes.map((n) => (a.abilityName ? `${a.abilityName}: ${n.text}` : n.text)),
    ),
    ...h.talentNotes.map((n) => `Talent: ${n.text}`),
  ].filter((l) => l.trim());
  return { lines: lines.slice(0, max), count: lines.length };
}

export function patchDigest(input: {
  patch: Pick<Patch, "version" | "name" | "publishedAt" | "sections">;
  poolHeroIds: readonly number[];
  results: readonly { heroId: number; startedAt: Date; result: "win" | "loss" }[];
  maxHighlights?: number;
}): PatchDigest {
  const pool = new Set(input.poolHeroIds);
  const heroes = input.patch.sections.heroes
    .filter((h) => pool.has(h.heroId))
    .map((h): DigestHero => {
      const cohort = heroCohort(input.results, h.heroId, input.patch.publishedAt);
      const { lines, count } = highlights(h, input.maxHighlights ?? 2);
      const enough =
        cohort.before.games >= MIN_COHORT_GAMES && cohort.after.games >= MIN_COHORT_GAMES;
      return {
        heroId: h.heroId,
        highlights: lines,
        noteCount: count,
        cohort,
        delta: enough
          ? cohort.after.wins / cohort.after.games - cohort.before.wins / cohort.before.games
          : null,
      };
    })
    // Most-played (in the comparison window) first.
    .sort(
      (a, b) =>
        b.cohort.before.games +
        b.cohort.after.games -
        (a.cohort.before.games + a.cohort.after.games),
    );
  return {
    version: input.patch.version,
    name: input.patch.name,
    publishedAt: input.patch.publishedAt,
    heroes,
  };
}
