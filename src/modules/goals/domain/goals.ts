/**
 * Weekly goals (pure): up to two per week, measured from the player's own games and MMR log.
 * Custom goals are text the player marks done themselves.
 */

export type Goal =
  | { type: "winRate"; target: number }
  | { type: "maxPerSession"; target: number }
  | { type: "logAfterSessions" }
  | { type: "heroGames"; heroId: number; target: number }
  | { type: "custom"; text: string; done: boolean };

export const MAX_GOALS = 2;
export const MAX_CUSTOM_LENGTH = 80;
/** Win rate goals count once there are this many ranked games in the week. */
export const MIN_WIN_RATE_GAMES = 5;
/** An MMR entry within this long after a session counts as logged for it. */
export const LOG_WINDOW_MS = 3 * 3_600_000;

export interface WeekData {
  games: ReadonlyArray<{ startedAt: Date; result: "win" | "loss"; heroId: number }>;
  /** Sessions with at least one ranked game this week. */
  sessions: ReadonlyArray<{ startedAt: Date; endedAt: Date; rankedGames: number }>;
  mmrEntries: readonly Date[];
}

/** Where a goal stands, as data, so the UI can word it in the viewer's language. */
export type GoalStatus =
  | { kind: "needGames"; games: number; min: number }
  | { kind: "winRate"; rate: number; wins: number; losses: number }
  | { kind: "longestSession"; games: number }
  | { kind: "noSessions" }
  | { kind: "sessionsLogged"; logged: number; total: number }
  | { kind: "heroGames"; played: number; target: number }
  | { kind: "done" }
  | { kind: "notYet" };

export interface GoalProgress {
  goal: Goal;
  /** "52%", "3 / 4 sessions", "4 / 10 games": where it stands now (English). */
  current: string;
  /** The same, as data. */
  status: GoalStatus;
  /** True once met (or still on track, for limits); false if missed; null if too early to say. */
  met: boolean | null;
  /** 0–1 for a progress bar, when it makes sense. */
  fraction: number | null;
}

export function describeGoal(goal: Goal, heroName: (id: number) => string): string {
  switch (goal.type) {
    case "winRate":
      return `Win at least ${goal.target}% of ranked games`;
    case "maxPerSession":
      return `Play at most ${goal.target} ranked games per session`;
    case "logAfterSessions":
      return "Log your MMR after every session";
    case "heroGames":
      return `Play ${heroName(goal.heroId)} ${goal.target} times`;
    case "custom":
      return goal.text;
  }
}

export function goalProgress(goal: Goal, week: WeekData): GoalProgress {
  switch (goal.type) {
    case "winRate": {
      const n = week.games.length;
      const wins = week.games.filter((g) => g.result === "win").length;
      if (n < MIN_WIN_RATE_GAMES)
        return {
          goal,
          current: `${n} / ${MIN_WIN_RATE_GAMES} games to count`,
          status: { kind: "needGames", games: n, min: MIN_WIN_RATE_GAMES },
          met: null,
          fraction: n / MIN_WIN_RATE_GAMES,
        };
      const rate = (wins / n) * 100;
      return {
        goal,
        current: `${rate.toFixed(0)}% (${wins}–${n - wins})`,
        status: { kind: "winRate", rate: Number(rate.toFixed(0)), wins, losses: n - wins },
        met: rate >= goal.target,
        fraction: Math.min(1, rate / goal.target),
      };
    }
    case "maxPerSession": {
      const most = Math.max(0, ...week.sessions.map((s) => s.rankedGames));
      return {
        goal,
        current: week.sessions.length ? `Longest session: ${most} games` : "No sessions yet",
        status: week.sessions.length
          ? { kind: "longestSession", games: most }
          : { kind: "noSessions" },
        met: week.sessions.length ? most <= goal.target : null,
        fraction: null,
      };
    }
    case "logAfterSessions": {
      const logged = week.sessions.filter((s) =>
        week.mmrEntries.some(
          (e) =>
            e.getTime() >= s.startedAt.getTime() &&
            e.getTime() <= s.endedAt.getTime() + LOG_WINDOW_MS,
        ),
      ).length;
      const n = week.sessions.length;
      return {
        goal,
        current: n ? `${logged} / ${n} sessions logged` : "No sessions yet",
        status: n ? { kind: "sessionsLogged", logged, total: n } : { kind: "noSessions" },
        met: n ? logged === n : null,
        fraction: n ? logged / n : null,
      };
    }
    case "heroGames": {
      const played = week.games.filter((g) => g.heroId === goal.heroId).length;
      return {
        goal,
        current: `${played} / ${goal.target} games`,
        status: { kind: "heroGames", played, target: goal.target },
        met: played >= goal.target ? true : null,
        fraction: Math.min(1, played / goal.target),
      };
    }
    case "custom":
      return {
        goal,
        current: goal.done ? "Done" : "Not yet",
        status: { kind: goal.done ? "done" : "notYet" },
        met: goal.done ? true : null,
        fraction: null,
      };
  }
}

/** At the end of the week, anything not met counts as missed. */
export function finalResult(p: GoalProgress): boolean {
  return p.met === true;
}
