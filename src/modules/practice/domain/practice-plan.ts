/**
 * Weekly practice plan (pure): two to four concrete steps built from the player's own data,
 * each with the numbers behind it. A step is only suggested when the data backs it; with too
 * little data the plan falls back to the basics and says why. Steps tick from real games and
 * actions in the week, never from anything assumed.
 */

export const MAX_STEPS = 4;
export const MIN_STEPS = 2;
/** Ranked games on a suggested hero that make up the practice step. */
export const HERO_PRACTICE_GAMES = 3;
/** Losses older than this aren't offered for review. */
export const REVIEW_WINDOW_DAYS = 30;
/** Weeks of past sessions checked before suggesting the MMR logging step. */
export const LOG_LOOKBACK_DAYS = 28;
/** Suggest logging when fewer than this share of recent sessions were logged. */
export const LOG_SHARE = 0.5;
/** An MMR entry within this long after a session counts as logged for it (as weekly goals). */
export const LOG_WINDOW_MS = 3 * 3_600_000;
/** Losses in a row that end the session in the stop-after-losses step. */
export const STOP_STREAK = 2;
/** The match tag that marks a loss as reviewed (a note on the match counts too). */
export const REVIEWED_TAG = "reviewed";

export interface WinRate {
  games: number;
  wins: number;
  rate: number;
}

export type PlanStep =
  | {
      id: string;
      kind: "practiceHero";
      heroId: number;
      target: number;
      reason: {
        position: number;
        /** High-rank win rate in the role (already pulled toward 50%), with its sample. */
        highRank: { rate: number; games: number } | null;
        contestRate: number | null;
        /** A hero that beats you often, which this one does well against. */
        counter: { nemesisId: number; yourLossRate: number; yourGames: number } | null;
      };
    }
  | {
      id: string;
      kind: "stopAfterLosses";
      streak: number;
      reason: { after: WinRate; baseline: WinRate };
    }
  | {
      id: string;
      kind: "reviewLoss";
      matchId: string;
      heroId: number;
      startedAt: Date;
      reason: { kills: number; deaths: number; assists: number };
    }
  | {
      id: string;
      kind: "logMmr";
      /** Recent sessions and how many were logged; null when it's a basic step. */
      reason: { logged: number; sessions: number } | null;
    };

export type StepKind = PlanStep["kind"];

/** Why a personal step is missing, so the card can say what more data would unlock. */
export type PlanGap =
  { kind: "tiltSample"; games: number; min: number } | { kind: "noRole" } | { kind: "noHeroes" };

export interface HeroPick {
  heroId: number;
  highRank: { rate: number; games: number } | null;
  contestRate: number | null;
  counter: { nemesisId: number; yourLossRate: number; yourGames: number } | null;
}

export interface RecentLoss {
  matchId: string;
  heroId: number;
  startedAt: Date;
  kills: number;
  deaths: number;
  assists: number;
}

export interface PlanInput {
  /** Hero pool advice; null when it couldn't be fetched. */
  heroes: { status: "ok"; position: number; picks: HeroPick[] } | { status: "no_role" } | null;
  /** Win rate after 2 losses in a row vs overall; `backed` when the tilt bar is met. */
  tilt: { after: WinRate; baseline: WinRate; backed: boolean; minGames: number } | null;
  /** Unreviewed ranked losses in the review window, newest first. */
  losses: readonly RecentLoss[];
  /** Ranked sessions in the weeks before this one, and how many had MMR logged after them. */
  logging: { sessions: number; logged: number };
}

export interface Plan {
  steps: PlanStep[];
  /** Other suggestions, offered when the player swaps a step. */
  alternates: PlanStep[];
  /** True when at least one step comes from the player's numbers beyond the basics. */
  personal: boolean;
  gaps: PlanGap[];
}

const heroStep = (position: number, pick: HeroPick): PlanStep => ({
  id: `practiceHero:${pick.heroId}`,
  kind: "practiceHero",
  heroId: pick.heroId,
  target: HERO_PRACTICE_GAMES,
  reason: {
    position,
    highRank: pick.highRank,
    contestRate: pick.contestRate,
    counter: pick.counter,
  },
});

const reviewStep = (loss: RecentLoss): PlanStep => ({
  id: `reviewLoss:${loss.matchId}`,
  kind: "reviewLoss",
  matchId: loss.matchId,
  heroId: loss.heroId,
  startedAt: loss.startedAt,
  reason: { kills: loss.kills, deaths: loss.deaths, assists: loss.assists },
});

/** Builds the week's plan: personal steps first, then the basics to reach two steps. */
export function buildPlan(input: PlanInput): Plan {
  const steps: PlanStep[] = [];
  const alternates: PlanStep[] = [];
  const gaps: PlanGap[] = [];

  if (input.heroes?.status === "ok") {
    const [first, ...rest] = input.heroes.picks;
    if (first) steps.push(heroStep(input.heroes.position, first));
    else gaps.push({ kind: "noHeroes" });
    const position = input.heroes.position;
    alternates.push(...rest.map((p) => heroStep(position, p)));
  } else if (input.heroes?.status === "no_role") {
    gaps.push({ kind: "noRole" });
  }

  if (input.tilt?.backed) {
    steps.push({
      id: "stopAfterLosses",
      kind: "stopAfterLosses",
      streak: STOP_STREAK,
      reason: { after: input.tilt.after, baseline: input.tilt.baseline },
    });
  } else if (input.tilt) {
    gaps.push({ kind: "tiltSample", games: input.tilt.after.games, min: input.tilt.minGames });
  }
  const personal = steps.length > 0;

  const [loss, ...olderLosses] = input.losses;
  if (loss) steps.push(reviewStep(loss));
  alternates.push(...olderLosses.slice(0, 2).map(reviewStep));

  const { sessions, logged } = input.logging;
  if (sessions > 0 && logged / sessions < LOG_SHARE) {
    steps.push({ id: "logMmr", kind: "logMmr", reason: { logged, sessions } });
  } else if (steps.length < MIN_STEPS && logged < sessions) {
    // A short plan: logging is the basic habit, as long as some sessions went unlogged.
    steps.push({ id: "logMmr", kind: "logMmr", reason: { logged, sessions } });
  } else if (steps.length < MIN_STEPS && sessions === 0) {
    // No recent sessions to measure logging by: offer it as a basic habit.
    steps.push({ id: "logMmr", kind: "logMmr", reason: null });
  }

  return {
    steps: steps.slice(0, MAX_STEPS),
    alternates: [...steps.slice(MAX_STEPS), ...alternates],
    personal,
    gaps,
  };
}

/** The alternate that replaces a step: same kind first, else a kind not already in the plan. */
export function pickSwap(plan: Pick<Plan, "steps" | "alternates">, stepId: string) {
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return null;
  const inPlan = new Set(plan.steps.map((s) => s.id));
  const kinds = new Set(plan.steps.filter((s) => s.id !== stepId).map((s) => s.kind));
  const options = plan.alternates.filter((a) => !inPlan.has(a.id));
  return (
    options.find((a) => a.kind === step.kind) ?? options.find((a) => !kinds.has(a.kind)) ?? null
  );
}

/** Replaces a step with its swap; the old step goes to the end of the alternates. */
export function swapStep<P extends Pick<Plan, "steps" | "alternates">>(
  plan: P,
  stepId: string,
): P | null {
  const next = pickSwap(plan, stepId);
  const old = plan.steps.find((s) => s.id === stepId);
  if (!next || !old) return null;
  return {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? next : s)),
    alternates: [...plan.alternates.filter((a) => a.id !== next.id), old],
  };
}

/** Removes a step for the rest of the week. */
export function dismissStep<P extends Pick<Plan, "steps" | "alternates">>(
  plan: P,
  stepId: string,
): P | null {
  if (!plan.steps.some((s) => s.id === stepId)) return null;
  return { ...plan, steps: plan.steps.filter((s) => s.id !== stepId) };
}

/** This week's ranked sessions (player's time zone), MMR entries and reviewed matches. */
export interface PlanWeek {
  sessions: ReadonlyArray<{
    startedAt: Date;
    endedAt: Date;
    games: ReadonlyArray<{ result: "win" | "loss"; heroId: number }>;
  }>;
  mmrEntries: readonly Date[];
  reviewed: ReadonlySet<string>;
}

export type StepStatus =
  | { kind: "heroGames"; played: number; target: number }
  | { kind: "streakRule"; sessions: number; broken: number }
  | { kind: "noSessions" }
  | { kind: "reviewed" }
  | { kind: "notReviewed" }
  | { kind: "sessionsLogged"; logged: number; total: number };

export interface StepProgress {
  status: StepStatus;
  /** True once done (or kept, for rules); false once broken; null while open. */
  done: boolean | null;
  /** 0–1 for a progress bar, when it makes sense. */
  fraction: number | null;
}

/** Sessions with a ranked game played after `streak` losses in a row in the same session. */
export function sessionsPlayedOn(week: PlanWeek, streak: number): number {
  return week.sessions.filter((s) => {
    let run = 0;
    for (const g of s.games) {
      if (run >= streak) return true;
      run = g.result === "loss" ? run + 1 : 0;
    }
    return false;
  }).length;
}

export function loggedSessions(sessions: PlanWeek["sessions"], entries: readonly Date[]): number {
  return sessions.filter((s) =>
    entries.some(
      (e) =>
        e.getTime() >= s.startedAt.getTime() && e.getTime() <= s.endedAt.getTime() + LOG_WINDOW_MS,
    ),
  ).length;
}

export function stepProgress(step: PlanStep, week: PlanWeek): StepProgress {
  switch (step.kind) {
    case "practiceHero": {
      const played = week.sessions
        .flatMap((s) => s.games)
        .filter((g) => g.heroId === step.heroId).length;
      return {
        status: { kind: "heroGames", played, target: step.target },
        done: played >= step.target ? true : null,
        fraction: Math.min(1, played / step.target),
      };
    }
    case "stopAfterLosses": {
      const n = week.sessions.length;
      if (n === 0) return { status: { kind: "noSessions" }, done: null, fraction: null };
      const broken = sessionsPlayedOn(week, step.streak);
      return {
        status: { kind: "streakRule", sessions: n, broken },
        done: broken === 0,
        fraction: null,
      };
    }
    case "reviewLoss": {
      const done = week.reviewed.has(step.matchId);
      return {
        status: { kind: done ? "reviewed" : "notReviewed" },
        done: done ? true : null,
        fraction: null,
      };
    }
    case "logMmr": {
      const n = week.sessions.length;
      if (n === 0) return { status: { kind: "noSessions" }, done: null, fraction: null };
      const logged = loggedSessions(week.sessions, week.mmrEntries);
      return {
        status: { kind: "sessionsLogged", logged, total: n },
        done: logged === n ? true : null,
        fraction: logged / n,
      };
    }
  }
}
