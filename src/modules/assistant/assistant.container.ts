import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { sharedAiBudget } from "@/common/llm/call-budget";
import { GroqClient, groqChatUrl } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { guideService } from "@/modules/guides";
import { isBuildFiller } from "@/modules/guides/domain/hero-guide";
import { heroesService } from "@/modules/heroes";
import { matchCoachService, matchesService, matchQueries } from "@/modules/matches";
import { metaService } from "@/modules/meta";
import { mmrJournalService } from "@/modules/mmr";
import { playersService } from "@/modules/players";
import { plusService } from "@/modules/plus";
import { sessionService } from "@/modules/sessions";
import { usageService } from "@/modules/usage";
import { AssistantController } from "./assistant.controller";
import { ASK_TIME_ZONE } from "./domain/ask-quota";
import { AppAskData } from "./infrastructure/app-ask-data";
import { GroqAskModel } from "./infrastructure/groq-ask-model";
import { AskChatsRepository, AskUsageRepository } from "./repositories/ask.repository";
import { AskService } from "./services/ask.service";

export const askChatsRepository = new AskChatsRepository(getDb);
export const askUsageRepository = new AskUsageRepository(getDb);

/** Ask Den's tools, each a closure over the feature that owns the data. */
const askData = new AppAskData({
  heroes: async () => [...(await matchesService.heroMap()).values()],
  items: () => matchesService.itemMap(),
  games: (accountId32, heroId) => matchQueries.heroFacts(accountId32, heroId),
  heroRecord: async (accountId32, heroId) =>
    (await heroesService.overview(accountId32, heroId, ASK_TIME_ZONE)).record,
  heroCoaching: (accountId32, heroId) => heroesService.coaching(accountId32, heroId),
  ownMatchups: async (accountId32, heroId) =>
    (
      await heroesService.ownMatchups(
        accountId32,
        { range: "all", mode: "all", hero: heroId },
        new Date(),
      )
    ).matchups,
  factSheet: (accountId32, matchId) => matchCoachService.factSheet(accountId32, matchId),
  latestSession: (owner) => sessionService.latest(owner),
  stopLoss: (owner, session) => sessionService.stopLoss(owner, session),
  tilt: (owner) => sessionService.tilt(owner),
  mmrEntries: (owner) => mmrJournalService.list(owner),
  rankTier: async (accountId32) =>
    (await playersService.quickProfile(accountId32)).profile?.rankTier ?? null,
  guide: async (heroId, position) => {
    const items = await matchesService.itemMap();
    return guideService.guide(heroId, (id) => items.get(id)?.qual === "consumable", {
      isFiller: (id) => isBuildFiller(items.get(id)),
      position,
    });
  },
  wardCells: () => guideService.wardCells(),
  topHeroes: (position, bracket) => metaService.topHeroes(position, bracket),
});

/** Ask Den (ADR 0015), on the coach's Groq key and the shared daily AI budget. */
export const askService = lazy(() => {
  const e = env();
  const apiKey = e.MATCH_COACH_API_KEY ?? e.GROQ_API_KEY;
  return new AskService({
    model:
      apiKey && e.ASK_ENABLED
        ? new GroqAskModel(new GroqClient({ apiKey, url: groqChatUrl(e.GROQ_BASE_URL) }), {
            model: e.ASK_MODEL ?? e.MATCH_COACH_MODEL ?? e.DRAFT_AI_MODEL,
            timeoutMs: e.ASK_TIMEOUT_MS,
          })
        : null,
    data: askData,
    chats: askChatsRepository,
    usage: askUsageRepository,
    isPlus: (userId) => plusService.isPlus(userId),
    names: async () => {
      const [heroes, items] = await Promise.all([
        matchesService.heroMap(),
        matchesService.itemMap(),
      ]);
      return [
        ...[...heroes.values()].map((h) => h.name),
        // Recipes aren't advice anyone gives by name.
        ...[...items.values()].filter((i) => !/^recipe/i.test(i.name)).map((i) => i.name),
      ];
    },
    budget: sharedAiBudget(e.DRAFT_AI_BUDGET_PER_DAY),
    limits: { free: e.ASK_FREE_PER_DAY, plus: e.ASK_PLUS_PER_DAY },
    used: (userId) => usageService.record("ask_den", userId),
    logger,
  });
});

export const assistantController = new AssistantController({
  service: () => askService,
  logger,
});
