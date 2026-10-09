import "server-only";
import { goalsService } from "@/modules/goals";
import { matchQueries } from "@/modules/matches";
import { mmrJournalService } from "@/modules/mmr";
import { notificationService } from "@/modules/notifications";
import { patchWatchlistService } from "@/modules/patches";
import { OnboardingService } from "./services/onboarding.service";

export const onboardingService = new OnboardingService({
  sources: {
    matches: async (accountId32) => (await matchQueries.importStatus(accountId32)).totals.all,
    mmrEntries: async (owner) => (await mmrJournalService.list(owner)).length,
    watchedHeroes: async (userId) => (await patchWatchlistService.get(userId)).heroIds.length,
    goalsThisWeek: async (owner, timeZone) =>
      (await goalsService.weekView(owner, timeZone)).thisWeek.length,
    notificationDevices: async (userId) => {
      const status = await notificationService.status(userId);
      return status.enabled ? status.endpoints.length : null;
    },
  },
});
