import "server-only";
import { logger } from "@/common/logging/logger";
import { annotationsService } from "@/modules/annotations";
import * as drafts from "@/modules/drafts/composition";
import { goalsService } from "@/modules/goals";
import { usersService } from "@/modules/identity";
import * as leaderboards from "@/modules/leaderboards/composition";
import * as matches from "@/modules/matches/composition";
import * as mmr from "@/modules/mmr/composition";
import * as patches from "@/modules/patches/composition";
import { followService } from "@/modules/players";
import { sessionService } from "@/modules/sessions";
import { togetherService } from "@/modules/together";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

export const privacyService = new PrivacyService({
  parts: [
    mmr,
    sessionService,
    followService,
    patches,
    leaderboards,
    drafts,
    matches,
    togetherService,
    annotationsService,
    goalsService,
  ],
  identity: usersService,
  logger,
});

export const privacyController = new PrivacyController({ service: privacyService });
