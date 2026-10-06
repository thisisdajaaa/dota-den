import "server-only";
import { logger } from "@/common/logging/logger";
import { annotationsService } from "@/modules/annotations";
import * as drafts from "@/modules/drafts/composition";
import { goalsService } from "@/modules/goals";
import { usersService } from "@/modules/identity";
import { activityService } from "@/modules/leaderboards";
import { matchesService } from "@/modules/matches";
import { mmrJournalService } from "@/modules/mmr";
import { patchWatchlistService } from "@/modules/patches";
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
    drafts,
    matchesService,
    togetherService,
    annotationsService,
    goalsService,
  ],
  identity: usersService,
  logger,
});

export const privacyController = new PrivacyController({ service: privacyService });
