import type { DataOwner } from "@/common/privacy/user-data";
import { onboardingChecklist, type OnboardingStep } from "../domain/checklist";
import type { OnboardingSources } from "../onboarding.ports";

/** The overview's first-visit checklist. */
export class OnboardingService {
  constructor(private readonly deps: { sources: OnboardingSources; now?: () => Date }) {}

  /** The steps, or null when it shouldn't show (old account, all done, or data unavailable). */
  async checklist(
    owner: DataOwner & { createdAt: Date },
    timeZone: string,
  ): Promise<OnboardingStep[] | null> {
    const now = this.deps.now?.() ?? new Date();
    // Old accounts never see it: skip the lookups.
    if (onboardingChecklist(emptyFacts(owner.createdAt), now) === null) return null;
    const s = this.deps.sources;
    const [matches, mmrEntries, watchedHeroes, goalsThisWeek, notificationDevices] =
      await Promise.all([
        s.matches(owner.accountId32),
        s.mmrEntries(owner),
        s.watchedHeroes(owner.userId),
        s.goalsThisWeek(owner, timeZone),
        s.notificationDevices(owner.userId).catch(() => null),
      ]);
    return onboardingChecklist(
      {
        accountCreatedAt: owner.createdAt,
        matches,
        mmrEntries,
        watchedHeroes,
        goalsThisWeek,
        notificationDevices,
      },
      now,
    );
  }
}

const emptyFacts = (accountCreatedAt: Date) => ({
  accountCreatedAt,
  matches: 0,
  mmrEntries: 0,
  watchedHeroes: 0,
  goalsThisWeek: 0,
  notificationDevices: null,
});
