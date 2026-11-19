import "server-only";
import { randomInt } from "node:crypto";
import { getDb } from "@/common/db/mongo";
import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { discordWebhooksRepository } from "@/modules/discord";
import { discordMessage } from "@/modules/discord/domain/feed";
import { usersService } from "@/modules/identity";
import { matchesService, matchQueries } from "@/modules/matches";
import { metaSource } from "@/modules/meta";
import { playersService } from "@/modules/players";
import { displayName } from "@/modules/players/ui/player-avatar";
import { plusService } from "@/modules/plus";
import { presenceService } from "@/modules/presence";
import { togetherService } from "@/modules/together";
import { INVITE_TOKEN_LENGTH } from "./domain/group";
import { GroupsController } from "./groups.controller";
import type {
  MemberGamesSource,
  MemberProfiles,
  PartySource,
  PlannerGamesSource,
} from "./groups.ports";
import { PlanDiscordPoster } from "./infrastructure/plan-discord-poster";
import { GroupsRepository } from "./repositories/groups.repository";
import { GroupPageService } from "./services/group-page.service";
import { GroupsService } from "./services/groups.service";
import { StackPlannerService } from "./services/stack-planner.service";
import { planLines } from "./ui/stack-plan-text";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const newToken = () =>
  Array.from({ length: INVITE_TOKEN_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const groupsRepository = new GroupsRepository(getDb);

/** Steam names stored at sign-in; OpenDota's public profile when a name is missing. */
const profiles: MemberProfiles = {
  profiles: async (members) => {
    const users = await usersService.findByIds(members.map((m) => m.userId));
    const byUser = new Map(users.map((u) => [u.id, u]));
    const personaOf = (m: (typeof members)[number]) => byUser.get(m.userId)?.persona ?? null;
    const unnamed = members.filter((m) => !personaOf(m)?.name).map((m) => m.accountId32);
    // One lookup for everyone without a saved Steam name.
    const found = await playersService.publicProfiles(unnamed).catch(() => new Map<number, null>());
    const rows = members.map((m) => {
      const persona = personaOf(m);
      if (persona?.name)
        return [
          m.accountId32,
          { personaName: persona.name, avatarUrl: persona.avatarUrl },
        ] as const;
      const p = found.get(m.accountId32) ?? null;
      return [
        m.accountId32,
        {
          personaName: p?.personaName ?? null,
          avatarUrl: p?.avatarUrl ?? persona?.avatarUrl ?? null,
        },
      ] as const;
    });
    return new Map(rows);
  },
};

const party: PartySource = {
  sameTeamAmong: (ids) => togetherService.sameTeamAmong(ids),
  analysePair: async (a, b, opts) => {
    const res = await togetherService.analysePair(a, b, opts);
    return res.ok
      ? { ok: true, value: { pending: res.value.pending, interrupted: res.value.interrupted } }
      : res;
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const games: MemberGamesSource = {
  recentHeroes: async (accountId32, now, days) => {
    const since = now.getTime() - days * DAY_MS;
    const { facts } = await matchQueries.dashboardFacts(
      accountId32,
      { range: "30d", mode: "all" },
      now,
    );
    return facts
      .filter((f) => f.startedAt.getTime() >= since)
      .map((f) => ({ heroId: f.heroId, result: f.result }));
  },
  rankedResults: async (accountId32, from, to) =>
    (await matchQueries.rankedResults(accountId32, { from, to })).map((r) => r.result),
};

export const groupsService = new GroupsService({
  repository: groupsRepository,
  profiles,
  newToken,
  groupLimit: (userId, base) => plusService.limit(userId, base),
});

export const groupPageService = new GroupPageService({
  repository: groupsRepository,
  party,
  games,
});

/** Members' recent lanes: the Meta page's cached OpenDota source (60 days, 100 games). */
const plannerGames: PlannerGamesSource = {
  laneGames: async (accountId32) => {
    const res = await metaSource.recentLanes(accountId32);
    if (!res.ok) logger.warn("planner_lanes_unavailable", { reason: res.error.type });
    return res.ok ? res.value.value.games : null;
  },
  heroes: () => matchesService.heroMap(),
};

/** Discord embeds cap a description at 4096 characters. */
const MAX_DESCRIPTION = 4000;

export const stackPlannerService = new StackPlannerService({
  party,
  games: plannerGames,
  profiles,
  presence: {
    playingNow: async (viewer) => {
      try {
        const res = await presenceService.playingNow(viewer);
        return res.friends.map((f) => f.accountId32);
      } catch (error) {
        logger.warn("planner_presence_failed", { error });
        return [];
      }
    },
  },
  discord: new PlanDiscordPoster({
    get: (userId) => discordWebhooksRepository.get(userId),
    markGone: (userId, now) => discordWebhooksRepository.markGone(userId, now),
  }),
  isPlus: (userId) => plusService.isPlus(userId),
  message: (plan, names, locale, groupName) => {
    const t = translator<Messages>(
      MESSAGES[isLocale(locale) ? locale : DEFAULT_LOCALE],
      englishMessages,
    );
    const { title, body } = planLines(t, plan, (id) => displayName(names.get(id) ?? null, id));
    return discordMessage([
      {
        title: title(groupName).slice(0, 256),
        description: body.join("\n").slice(0, MAX_DESCRIPTION),
        color: 0xd4a843,
        footer: { text: t("groups.planner.text.footer").slice(0, 2048) },
      },
    ]);
  },
});

export const groupsController = new GroupsController({
  service: groupsService,
  planner: stackPlannerService,
});
