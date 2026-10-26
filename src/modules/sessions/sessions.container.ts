import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import type { DashboardFact } from "@/modules/matches/domain/read-models";
import { matchQueries } from "@/modules/matches";
import { matchesService, matchSyncService } from "@/modules/matches";
import { usersService } from "@/modules/identity";
import { notificationService } from "@/modules/notifications";
import { plusService } from "@/modules/plus";
import { steamSource } from "@/modules/presence";
import { mmrJournalService } from "@/modules/mmr";
import { SessionCompanionService } from "./companion.service";
import {
  CompanionStateRepository,
  SessionNotesRepository,
  SessionSettingsRepository,
} from "./repositories/sessions.repository";
import { SessionsController } from "./sessions.controller";
import { SessionService } from "./sessions.service";

export const sessionNotesRepository = new SessionNotesRepository(getDb);
export const sessionSettingsRepository = new SessionSettingsRepository(getDb);

/**
 * Sessions read other features only through their query services: imported matches from
 * the matches feature and the user's own MMR entries from the MMR journal.
 */
export const sessionService = lazy(
  () =>
    new SessionService<DashboardFact>({
      matches: {
        async listMatches(accountId32) {
          // Every game type; the query returns the newest 5,000 (older ones don't form sessions).
          const { facts } = await matchQueries.dashboardFacts(
            accountId32,
            { range: "all", mode: "all" },
            new Date(),
          );
          return facts;
        },
      },
      observations: {
        async list(owner) {
          const entries = await mmrJournalService.list(owner);
          return entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr }));
        },
      },
      notes: sessionNotesRepository,
      settings: sessionSettingsRepository,
      defaultGapMinutes: env().SESSION_DEFAULT_GAP_MINUTES,
      data: { notes: sessionNotesRepository, settings: sessionSettingsRepository },
    }),
);

export const sessionsController = new SessionsController({ service: sessionService });

export const companionStateRepository = new CompanionStateRepository(getDb);

/**
 * The Plus session companion (`session-companion` job, every 5 minutes). Everything else is
 * reached when it runs: notifications, Plus and identity import this feature too.
 */
export const sessionCompanionService = lazy(
  () =>
    new SessionCompanionService({
      players: async () => {
        if (!notificationService.enabled) return [];
        const [plus, subscribed] = await Promise.all([
          plusService.plusUserIds(),
          notificationService.subscribedUserIds(),
        ]);
        const withDevice = new Set(subscribed);
        const ids: string[] = [];
        for (const id of plus) {
          if (withDevice.has(id) && (await notificationService.prefs(id)).session_live)
            ids.push(id);
        }
        return (await usersService.findByIds(ids)).map((u) => ({
          userId: u.id,
          accountId32: u.accountId32,
          steamId64: u.steamId64,
        }));
      },
      playing: async (steamIds) => {
        const steam = steamSource();
        if (!steam) return null;
        const out = new Map<string, string | null>();
        for (let i = 0; i < steamIds.length; i += 100) {
          const rows = await steam.summaries(steamIds.slice(i, i + 100));
          if (!rows) return null;
          for (const r of rows) out.set(r.steamId64, r.gameId);
        }
        return out;
      },
      state: companionStateRepository,
      sync: async (accountId32) => {
        await matchSyncService.sync(accountId32);
      },
      matches: async (accountId32) =>
        (await matchQueries.dashboardFacts(accountId32, { range: "all", mode: "all" }, new Date()))
          .facts,
      gapMinutes: async (userId) =>
        (await sessionSettingsRepository.getGap(userId)) ?? env().SESSION_DEFAULT_GAP_MINUTES,
      notify: async (userId, news) => {
        const [user] = await usersService.findByIds([userId]);
        const language = user?.settings.language;
        const t = translator<Messages>(
          MESSAGES[isLocale(language) ? language : DEFAULT_LOCALE],
          englishMessages,
        );
        return notificationService.notifyOnce(userId, "session_live", news.matchId, async () => {
          const hero =
            (await matchesService.heroMap()).get(news.heroId)?.name ??
            t("notifications.push.heroFallback", { id: news.heroId });
          const body = news.tilt
            ? t("notifications.push.sessionLive.tilt", {
                losses: news.tilt.streak,
                after: Math.round(news.tilt.after.rate * 100),
                games: news.tilt.after.games,
                baseline: Math.round(news.tilt.baseline.rate * 100),
              })
            : t(`notifications.push.sessionLive.${news.result === "win" ? "body" : "bodyLoss"}`);
          return {
            title: t("notifications.push.sessionLive.title", {
              result: t(`notifications.push.sessionLive.${news.result}`),
              hero,
              wins: news.session.wins,
              losses: news.session.losses,
            }),
            body,
            url: `/matches/${news.matchId}`,
            tag: `session-live-${news.matchId}`,
          };
        });
      },
      logger,
    }),
);
