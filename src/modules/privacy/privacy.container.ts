import "server-only";
import { logger } from "@/common/logging/logger";
import { annotationsService } from "@/modules/annotations";
import { draftsPrivacy } from "@/modules/drafts";
import { goalsService } from "@/modules/goals";
import { usersService } from "@/modules/identity";
import { activityService } from "@/modules/leaderboards";
import { matchesService } from "@/modules/matches";
import { mmrJournalService } from "@/modules/mmr";
import { patchWatchlistService } from "@/modules/patches";
import { battleReportService } from "@/modules/report";
import { followService } from "@/modules/players";
import { sessionService } from "@/modules/sessions";
import { togetherService } from "@/modules/together";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

export const privacyService = new PrivacyService({
  parts: [
    mmrJournalService,
    sessionService,
    followService,
    patchWatchlistService,
    activityService,
    draftsPrivacy,
    matchesService,
    togetherService,
    annotationsService,
    goalsService,
    battleReportService,
  ],
  identity: usersService,
  logger,
});

export const privacyController = new PrivacyController({ service: privacyService });
