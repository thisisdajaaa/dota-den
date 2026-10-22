import "server-only";
import { randomInt } from "node:crypto";
import { getDb } from "@/common/db/mongo";
import { usersService } from "@/modules/identity";
import { matchQueries } from "@/modules/matches";
import { playersService } from "@/modules/players";
import { plusService } from "@/modules/plus";
import { togetherService } from "@/modules/together";
import { INVITE_TOKEN_LENGTH } from "./domain/group";
import { GroupsController } from "./groups.controller";
import type { MemberGamesSource, MemberProfiles, PartySource } from "./groups.ports";
import { GroupsRepository } from "./repositories/groups.repository";
import { GroupPageService } from "./services/group-page.service";
import { GroupsService } from "./services/groups.service";

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

export const groupsController = new GroupsController({ service: groupsService });
