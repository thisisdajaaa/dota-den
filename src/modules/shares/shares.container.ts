import "server-only";
import { randomInt } from "node:crypto";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { matchesService } from "@/modules/matches";
import { mmrInsightsService } from "@/modules/mmr";
import { sessionService } from "@/modules/sessions";
import { MAX_HEROES } from "./domain/share";
import { SharesRepository } from "./repositories/shares.repository";
import { SharesController } from "./shares.controller";
import { SharesService } from "./services/shares.service";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const newSlug = () =>
  Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const sharesRepository = new SharesRepository(getDb);

export const sharesService = new SharesService({
  repository: sharesRepository,
  newSlug,
  sources: {
    session: async (owner, sessionId) => {
      const detail = await sessionService.detail(owner, sessionId);
      if (!detail) return null;
      const { session } = detail;
      const best = session.stats.best?.match ?? null;
      return {
        kind: "session",
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        games: session.stats.games,
        wins: session.stats.wins,
        losses: session.stats.losses,
        heroes: session.stats.heroes
          .slice(0, MAX_HEROES)
          .map((h) => ({ heroId: h.heroId, games: h.games, wins: h.wins })),
        best: best
          ? { heroId: best.heroId, kills: best.kills, deaths: best.deaths, assists: best.assists }
          : null,
      };
    },
    week: async (owner, timeZone) => {
      const recap = await mmrInsightsService.weeklyRecap(owner, timeZone);
      return {
        kind: "week",
        from: recap.from,
        to: recap.to,
        games: recap.thisWeek.games,
        wins: recap.thisWeek.wins,
        losses: recap.thisWeek.losses,
        mostPlayed: recap.mostPlayed,
        best: recap.best,
      };
    },
    playerName: async (accountId32) =>
      (await matchesService.playerProfile(accountId32))?.personaName ?? null,
  },
});

export const sharesController = new SharesController({
  service: sharesService,
  appUrl: () => env().APP_URL,
});
