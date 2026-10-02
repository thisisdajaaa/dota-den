/**
 * Achievements (pure): computed from the player's own data each time, never stored, so they
 * can't drift from what actually happened. Each has tiers; a player's tier is the highest
 * reached, with progress shown toward the next.
 */

export interface AchievementGame {
  startedAt: Date;
  result: "win" | "loss";
  heroId: number;
}

export interface AchievementInput {
  /** Ranked games grouped into play sessions (oldest first within each). */
  sessions: ReadonlyArray<{ matches: readonly AchievementGame[] }>;
  /** Distinct days the player logged MMR. */
  mmrDays: number;
  /** Practice drafts saved. */
  drafts: number;
  /** Draft challenges answered. */
  challenges: number;
}

export type AchievementId =
  "streak" | "pool" | "marathon" | "comeback" | "veteran" | "journal" | "drafter" | "puzzles";

export interface Achievement {
  id: AchievementId;
  title: string;
  /** What's counted, with {n} for the tier's number. */
  description: string;
  tiers: readonly number[];
  value: number;
  /** Tiers reached: 0 (none) to tiers.length. */
  tier: number;
  /** The next tier's number, or null when all are reached. */
  next: number | null;
}

const DEFS: ReadonlyArray<{
  id: AchievementId;
  title: string;
  description: string;
  tiers: readonly number[];
}> = [
  {
    id: "streak",
    title: "On a roll",
    description: "Win {n} ranked games in a row",
    tiers: [3, 5, 8, 10],
  },
  {
    id: "pool",
    title: "Deep pool",
    description: "Win ranked games with {n} heroes",
    tiers: [10, 25, 50, 75],
  },
  {
    id: "marathon",
    title: "Marathon",
    description: "Play {n} ranked games in one session",
    tiers: [5, 8, 12],
  },
  {
    id: "comeback",
    title: "Comeback",
    description: "Win right after 3+ straight losses, {n} times",
    tiers: [1, 5, 20],
  },
  {
    id: "veteran",
    title: "Veteran",
    description: "Play {n} ranked games",
    tiers: [100, 500, 1_000, 2_500],
  },
  {
    id: "journal",
    title: "Keeping score",
    description: "Log your MMR on {n} days",
    tiers: [1, 7, 30],
  },
  { id: "drafter", title: "Drafter", description: "Save {n} practice drafts", tiers: [1, 10, 50] },
  {
    id: "puzzles",
    title: "Puzzle solver",
    description: "Answer {n} draft challenges",
    tiers: [5, 25, 100],
  },
];

/** Best win streak overall (across sessions: a streak isn't broken by a break). */
function bestStreak(games: readonly AchievementGame[]): number {
  let best = 0;
  let run = 0;
  for (const g of games) {
    run = g.result === "win" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function comebacks(sessions: AchievementInput["sessions"]): number {
  let n = 0;
  for (const s of sessions) {
    let losses = 0;
    for (const g of s.matches) {
      if (g.result === "win") {
        if (losses >= 3) n++;
        losses = 0;
      } else losses++;
    }
  }
  return n;
}

export function achievements(input: AchievementInput): Achievement[] {
  const games = input.sessions
    .flatMap((s) => s.matches)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const values: Record<AchievementId, number> = {
    streak: bestStreak(games),
    pool: new Set(games.filter((g) => g.result === "win").map((g) => g.heroId)).size,
    marathon: Math.max(0, ...input.sessions.map((s) => s.matches.length)),
    comeback: comebacks(input.sessions),
    veteran: games.length,
    journal: input.mmrDays,
    drafter: input.drafts,
    puzzles: input.challenges,
  };
  return DEFS.map((d) => {
    const value = values[d.id];
    const tier = d.tiers.filter((t) => value >= t).length;
    return { ...d, value, tier, next: d.tiers[tier] ?? null };
  });
}

/** "Win 5 ranked games in a row" for a tier's number. */
export function describe(a: Pick<Achievement, "description">, n: number): string {
  return a.description.replace("{n}", n.toLocaleString("en-US"));
}
