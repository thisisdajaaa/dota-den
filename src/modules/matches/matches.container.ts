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
import { discordFeedService } from "@/modules/discord";
import { errorsService } from "@/modules/errors";
import { isNotableItem } from "@/modules/heroes/domain/hero-stats";
import { jobsService } from "@/modules/jobs";
import { plusService } from "@/modules/plus";
import { PARSE_REQUEST_LIMIT, policyFor } from "./domain/sync-policy";
import { GroqMatchCoach } from "./infrastructure/groq-match-coach";
import { OpenDotaAdapter } from "./infrastructure/opendota-adapter";
import { MatchesController } from "./matches.controller";
import {
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
import { MatchCoachService } from "./services/match-coach.service";
import { MatchExtrasService } from "./services/match-extras.service";
import { MatchSyncService } from "./services/match-sync.service";
import { MatchesService } from "./services/matches.service";

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

/** The AI match coach (ADR 0014). Off without a Groq key or with MATCH_COACH_ENABLED=false. */
export const matchCoachService = lazy(() => {
  const e = env();
  const apiKey = e.MATCH_COACH_API_KEY ?? e.GROQ_API_KEY;
  return new MatchCoachService({
    matches: matchesService,
    patches: openDotaAdapter,
    reviews: coachReviewsRepository,
    usage: coachUsageRepository,
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
    logger,
  });
});

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
