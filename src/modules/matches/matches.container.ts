import "server-only";
import { after } from "next/server";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { afterResponse } from "@/common/http/after-response";
import { rateLimit } from "@/common/http/rate-limit";
import { sharedAiBudget } from "@/common/llm/call-budget";
import { GroqClient, groqChatUrl } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { discordFeedService } from "@/modules/discord";
import { errorsService } from "@/modules/errors";
import { isNotableItem } from "@/modules/heroes/domain/hero-stats";
import { usersService } from "@/modules/identity";
import { jobsService } from "@/modules/jobs";
import { notificationService } from "@/modules/notifications";
import { plusService } from "@/modules/plus";
import { PARSE_REQUEST_LIMIT, policyFor } from "./domain/sync-policy";
import { GroqMatchCoach } from "./infrastructure/groq-match-coach";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import { MatchesController } from "./matches.controller";
import {
  AutoReviewsRepository,
  CoachReviewsRepository,
  CoachUsageRepository,
  ParseRequestsRepository,
} from "./repositories/match-coach.repository";
import {
  MatchFactsRepository,
  MatchReadRepository,
  SyncStatesRepository,
} from "./repositories/matches.repository";
import { MatchExtrasRepository } from "./repositories/match-extras.repository";
import { AutoParseService } from "./services/auto-parse.service";
import { AutoReviewService } from "./services/auto-review.service";
import { MatchCoachService } from "./services/match-coach.service";
import { MatchExtrasService } from "./services/match-extras.service";
import { MatchSyncService } from "./services/match-sync.service";
import { MatchesService } from "./services/matches.service";
import { usageService } from "@/modules/usage";

export const matchFactsRepository = new MatchFactsRepository(getDb);
export const syncStatesRepository = new SyncStatesRepository(getDb);
/** The matches query port (dashboard facts, ranked results, lists): read by many features. */
export const matchQueries = new MatchReadRepository(getDb);

/** The shared OpenDota adapter (one gateway: shared cache, dedup and circuit breaker). */
export const openDotaAdapter = lazy(() => new OpenDotaAdapter(openDotaGateway(), openDotaConfig()));

/** Whether a Dota account has Plus right now (false on any failure or while Plus is off). */
async function accountHasPlus(accountId32: number): Promise<boolean> {
  return (await plusService.supporters([accountId32])).has(accountId32);
}

export const matchSyncService = new MatchSyncService({
  provider: openDotaAdapter,
  patches: openDotaAdapter,
  facts: matchFactsRepository,
  syncState: syncStatesRepository,
  // Plus priority sync (ADR 0014): a faster pace for a supporter's own history import.
  policy: async (accountId32) => policyFor(await accountHasPlus(accountId32)),
});

export const matchesService = new MatchesService({
  openDota: openDotaAdapter,
  store: matchQueries,
  logger,
});

export const matchExtrasRepository = new MatchExtrasRepository(getDb);

/** Item timings and lanes from your parsed games, a few match details per day. */
export const matchExtrasService = new MatchExtrasService({
  store: matchExtrasRepository,
  provider: openDotaAdapter,
  completedItems: async () => {
    const res = await openDotaAdapter.getItems();
    if (!res.ok) return null;
    const completed = new Set(res.value.filter(isNotableItem).map((i) => i.key));
    return (key) => completed.has(key);
  },
  logger,
});

export const coachReviewsRepository = new CoachReviewsRepository(getDb);
export const coachUsageRepository = new CoachUsageRepository(getDb);
export const parseRequestsRepository = new ParseRequestsRepository(getDb);
export const autoReviewsRepository = new AutoReviewsRepository(getDb);

/** The AI match coach (ADR 0014). Off without a Groq key or with MATCH_COACH_ENABLED=false. */
export const matchCoachService = lazy(() => {
  const e = env();
  const apiKey = e.MATCH_COACH_API_KEY ?? e.GROQ_API_KEY;
  return new MatchCoachService({
    matches: matchesService,
    patches: openDotaAdapter,
    reviews: coachReviewsRepository,
    usage: coachUsageRepository,
    autoReviews: autoReviewsRepository,
    isPlus: (userId) => plusService.isPlus(userId),
    writer:
      apiKey && e.MATCH_COACH_ENABLED
        ? new GroqMatchCoach(new GroqClient({ apiKey, url: groqChatUrl(e.GROQ_BASE_URL) }), {
            model: e.MATCH_COACH_MODEL ?? e.DRAFT_AI_MODEL,
            timeoutMs: e.MATCH_COACH_TIMEOUT_MS,
          })
        : null,
    // The same daily cap as the draft AI: one budget for every paid model call.
    budget: sharedAiBudget(e.DRAFT_AI_BUDGET_PER_DAY),
    used: (userId) => usageService.record("coach_review", userId),
    logger,
  });
});

/**
 * Plus auto post-game reviews: after a sync, the newest ranked games are reviewed by the AI
 * coach once their replays are parsed (retried by the `coach-auto-review` job), with a push.
 * Everything here is resolved when used: identity and notifications import this feature too.
 */
export const autoReviewService = lazy(
  () =>
    new AutoReviewService({
      reviews: autoReviewsRepository,
      isPlus: (userId) => plusService.isPlus(userId),
      wants: async (userId) => (await notificationService.prefs(userId)).coach_review,
      user: async (userId) => {
        const [user] = await usersService.findByIds([userId]);
        if (!user) return null;
        const language = user.settings.language;
        return {
          accountId32: user.accountId32,
          locale: isLocale(language) ? language : DEFAULT_LOCALE,
        };
      },
      review: (user, matchId, locale) => matchCoachService.review(user, matchId, locale),
      enqueue: (attempt, delaySec) => jobsService.enqueueCoachAutoReview(attempt, delaySec),
      notify: async (userId, matchId, news) => {
        const [user] = await usersService.findByIds([userId]);
        const language = user?.settings.language;
        const t = translator<Messages>(
          MESSAGES[isLocale(language) ? language : DEFAULT_LOCALE],
          englishMessages,
        );
        return notificationService.notifyOnce(userId, "coach_review", matchId, async () => {
          const hero =
            (await matchesService.heroMap()).get(news.heroId)?.name ??
            t("notifications.push.heroFallback", { id: news.heroId });
          return {
            title: t("notifications.push.coachReview.title", { hero }),
            body: t("notifications.push.coachReview.body", {
              first: news.first,
              points: news.points,
            }),
            url: `/matches/${matchId}#coach-title`,
            tag: `coach-review-${matchId}`,
          };
        });
      },
      used: (userId) => usageService.record("auto_review", userId),
      logger,
    }),
);

/** Plus auto parse requests after a sync imports new games (ADR 0014). */
export const autoParseService = new AutoParseService({
  requests: parseRequestsRepository,
  provider: openDotaAdapter,
  isPlus: (userId) => plusService.isPlus(userId),
  // The parse button's allowance (per visitor there), counted per player here, so auto
  // requests never ask more often than one player pressing the button could.
  allow: (userId) =>
    rateLimit(`match-parse:${userId}`, PARSE_REQUEST_LIMIT.limit, PARSE_REQUEST_LIMIT.windowMs),
  logger,
});

export const matchesController = new MatchesController({
  sync: matchSyncService,
  matches: matchesService,
  coach: () => matchCoachService,
  continueBackfill: (accountId32) => jobsService.enqueueMatchBackfill(accountId32),
  reportError: ({ message, path }) =>
    errorsService.record({ source: "server", kind: "sync", message, path }),
  // Post the new games to the player's Discord feed (if they set one up) after the response,
  // and (Plus) ask OpenDota to parse the newest ones so the coach has data.
  onNewMatches: (user) => {
    const { accountId32 } = user;
    after(() =>
      discordFeedService
        .postNewFor(accountId32)
        .then((result) => {
          if (result.outcome !== "off")
            logger.info("discord_feed_posted", { accountId32, ...result });
        })
        .catch((error: unknown) => logger.warn("discord_feed_failed", { accountId32, error })),
    );
    afterResponse("auto_parse", () => autoParseService.afterSync(user), { accountId32 });
    // (Plus) schedule AI reviews of the newest ranked games, written once they're parsed.
    afterResponse("auto_review", () => autoReviewService.afterSync(user), { accountId32 });
  },
  // A few match details for the hero coaching extras, within the daily cap, after the response.
  onSynced: (accountId32) =>
    after(() =>
      matchExtrasService
        .backfill(accountId32)
        .then((run) => {
          if (run.fetched > 0) logger.info("match_extras_filled", { accountId32, ...run });
        })
        .catch((error: unknown) => logger.warn("match_extras_failed", { accountId32, error })),
    ),
  logger,
});
