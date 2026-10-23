import "server-only";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { annotationsService } from "@/modules/annotations";
import { discordWebhookService } from "@/modules/discord";
import { draftsPrivacy } from "@/modules/drafts";
import { emailService } from "@/modules/email";
import { goalsService } from "@/modules/goals";
import { groupsService } from "@/modules/groups";
import { usersService } from "@/modules/identity";
import { activityService } from "@/modules/leaderboards";
import { streamerFollowService } from "@/modules/live";
import { matchCoachService, matchExtrasService, matchesService } from "@/modules/matches";
import { mmrJournalService } from "@/modules/mmr";
import { notificationService } from "@/modules/notifications";
import { plusService } from "@/modules/plus";
import { sharesService } from "@/modules/shares";
import { patchWatchlistService } from "@/modules/patches";
import { practiceService } from "@/modules/practice";
import { battleReportService } from "@/modules/report";
import { followService } from "@/modules/players";
import { sessionService } from "@/modules/sessions";
import { togetherService } from "@/modules/together";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

export const privacyService = lazy(
  () =>
    new PrivacyService({
      parts: [
        mmrJournalService,
        sessionService,
        followService,
        streamerFollowService,
        patchWatchlistService,
        activityService,
        draftsPrivacy,
        matchesService,
        matchExtrasService,
        // AI coach reviews and the free quota's record (ADR 0014).
        matchCoachService,
        togetherService,
        groupsService,
        annotationsService,
        goalsService,
        practiceService,
        battleReportService,
        notificationService,
        sharesService,
        discordWebhookService,
        emailService,
        // The local subscription record; billing records stay with the provider (ADR 0013).
        plusService,
      ],
      identity: usersService,
      logger,
    }),
);

export const privacyController = new PrivacyController({ service: privacyService });
