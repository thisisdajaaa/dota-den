/** The first-visit checklist (pure): which steps a new player has done. */

export const ONBOARDING_STEPS = ["matches", "mmr", "heroes", "goal", "notifications"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  /** Where the step is done in the app; null when it happens elsewhere (Dota's settings). */
  href: string | null;
}

export interface OnboardingFacts {
  accountCreatedAt: Date;
  matches: number;
  mmrEntries: number;
  watchedHeroes: number;
  goalsThisWeek: number;
  /** Null when notifications aren't available on this server: the step is left out. */
  notificationDevices: number | null;
}

/** New accounts see the checklist for this long, unless they finish it sooner. */
export const ONBOARDING_WINDOW_MS = 30 * 86_400_000;

/** The steps to show, or null when the checklist shouldn't show at all. */
export function onboardingChecklist(facts: OnboardingFacts, now: Date): OnboardingStep[] | null {
  if (now.getTime() - facts.accountCreatedAt.getTime() > ONBOARDING_WINDOW_MS) return null;
  const steps: OnboardingStep[] = [
    { id: "matches", done: facts.matches > 0, href: null },
    { id: "mmr", done: facts.mmrEntries > 0, href: "/mmr" },
    { id: "heroes", done: facts.watchedHeroes > 0, href: "/patches" },
    { id: "goal", done: facts.goalsThisWeek > 0, href: "#goals-title" },
  ];
  if (facts.notificationDevices !== null)
    steps.push({
      id: "notifications",
      done: facts.notificationDevices > 0,
      href: "/account#notifications",
    });
  return steps.every((s) => s.done) ? null : steps;
}
