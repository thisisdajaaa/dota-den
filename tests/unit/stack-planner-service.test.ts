import { describe, expect, it, vi } from "vitest";
import {
  ForbiddenError,
  NotFoundError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import type { Group } from "@/modules/groups/domain/group";
import type { PlannerDiscord, PostOutcome } from "@/modules/groups/groups.ports";
import { PlanDiscordPoster } from "@/modules/groups/infrastructure/plan-discord-poster";
import { StackPlannerService } from "@/modules/groups/services/stack-planner.service";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import type { LaneGame } from "@/modules/meta/domain/position";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-19T12:00:00Z");
const sec = NOW.getTime() / 1000 - 86_400;

const group: Group = {
  id: "a".repeat(24),
  name: "Barkada",
  ownerUserId: "u1",
  inviteToken: "t".repeat(24),
  members: [1, 2, 3, 4, 5, 6].map((n) => ({
    userId: `u${n}`,
    accountId32: n,
    joinedAt: NOW,
  })),
  createdAt: NOW,
  updatedAt: NOW,
};
const viewer = { id: "u1", accountId32: 1, steamId64: "76561197960265729" };

const hero = (id: number, roles: string[]): HeroInfo => ({
  id,
  name: `Hero ${id}`,
  imageUrl: null,
  iconUrl: null,
  renderUrl: null,
  roles,
  attackType: null,
  primaryAttr: null,
});
const heroes = new Map([
  [10, hero(10, ["Carry"])],
  [40, hero(40, ["Support"])],
]);
const games = (laneRole: number, heroId: number, n: number): LaneGame[] =>
  Array.from({ length: n }, (_, i) => ({
    heroId,
    laneRole,
    isRoaming: false,
    result: i % 3 === 0 ? "loss" : "win",
    matchId: `${heroId}-${i}`,
    startTime: sec,
  }));

function service(
  opts: {
    plus?: boolean;
    playing?: number[];
    discord?: Partial<PlannerDiscord>;
    lanes?: (id: number) => Promise<LaneGame[] | null>;
  } = {},
) {
  const post = vi.fn(async (): Promise<PostOutcome> => ({ kind: "ok" }));
  const message = vi.fn(() => ({
    username: "Dota Den",
    embeds: [],
    allowed_mentions: { parse: [] as [] },
  }));
  const svc = new StackPlannerService({
    party: { sameTeamAmong: async () => [] },
    games: {
      laneGames: opts.lanes ?? (async (id) => (id % 2 ? games(1, 10, 6) : games(3, 40, 6))),
      heroes: async () => heroes,
    },
    profiles: {
      profiles: async (ms) =>
        new Map(
          ms.map((m) => [m.accountId32, { personaName: `P${m.accountId32}`, avatarUrl: null }]),
        ),
    },
    presence: { playingNow: async () => opts.playing ?? [] },
    discord: { channel: async () => ({ name: "barkada-den" }), post, ...opts.discord },
    isPlus: async () => opts.plus ?? false,
    message,
    now: () => NOW,
  });
  return { svc, post, message };
}

describe("StackPlannerService", () => {
  it("ticks you and members seen in Dota; otherwise just you in a big group", async () => {
    const seen = await service({ playing: [3, 99] }).svc.context(viewer, group);
    expect(seen.defaultIn).toEqual([1, 3]);
    expect(seen.playing).toEqual([3]);
    const none = await service().svc.context(viewer, group);
    expect(none.defaultIn).toEqual([1]);
    const small = await service().svc.context(viewer, {
      ...group,
      members: group.members.slice(0, 3),
    });
    expect(small.defaultIn).toEqual([1, 2, 3]);
  });

  it("only offers Discord with Plus and a saved webhook", async () => {
    expect((await service().svc.context(viewer, group)).discord).toBeNull();
    expect((await service({ plus: true }).svc.context(viewer, group)).discord).toEqual({
      name: "barkada-den",
    });
  });

  it("gives hero options with Plus only", async () => {
    const free = await service().svc.plan(viewer, group, [1, 2]);
    expect(free.heroesLocked).toBe(true);
    expect(free.slots.every((s) => s.heroes.length === 0)).toBe(true);
    expect(free.slots.map((s) => [s.accountId32, s.position])).toEqual([
      [1, 1],
      [2, 4],
    ]);
    const plus = await service({ plus: true }).svc.plan(viewer, group, [1, 2]);
    expect(plus.heroesLocked).toBe(false);
    expect(plus.slots[0].heroes[0]).toMatchObject({ heroId: 10, games: 6, wins: 4 });
    expect(plus.heroInfo[10].name).toBe("Hero 10");
  });

  it("plans only for this group's members, 2 to 5 of them", async () => {
    const { svc } = service();
    await expect(svc.plan(viewer, group, [1])).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.plan(viewer, group, [1, 2, 3, 4, 5, 6])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(svc.plan(viewer, group, [1, 77])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("plans with whoever it can read, and fails only when nobody can be read", async () => {
    const some = await service({
      lanes: async (id) => (id === 2 ? null : games(1, 10, 6)),
    }).svc.plan(viewer, group, [1, 2]);
    expect(some.unavailable).toEqual([2]);
    await expect(
      service({ lanes: async () => null }).svc.plan(viewer, group, [1, 2]),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });

  it("posts to Discord only with Plus and a webhook, in your language", async () => {
    await expect(service().svc.postToDiscord(viewer, group, [1, 2], "fil")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      service({ plus: true, discord: { channel: async () => null } }).svc.postToDiscord(
        viewer,
        group,
        [1, 2],
        "fil",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    const { svc, post, message } = service({ plus: true });
    expect(await svc.postToDiscord(viewer, group, [1, 2], "ceb")).toEqual({
      channel: "barkada-den",
    });
    expect(post).toHaveBeenCalledOnce();
    const [, names, locale, groupName] = message.mock.calls[0] as unknown as [
      unknown,
      Map<number, string>,
      string,
      string,
    ];
    expect(locale).toBe("ceb");
    expect(groupName).toBe("Barkada");
    expect([...names.keys()]).toEqual([1, 2]);
  });
});

describe("PlanDiscordPoster", () => {
  const target = { origin: "https://discord.com", id: "123456789012345678", token: "x".repeat(60) };

  it("posts to the saved webhook and marks it gone when Discord deleted it", async () => {
    const markGone = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));
    const poster = new PlanDiscordPoster(
      { get: async () => ({ target, name: "den", gone: false }), markGone },
      fetchImpl as unknown as typeof fetch,
    );
    const msg = { username: "Dota Den", embeds: [], allowed_mentions: { parse: [] as [] } };
    expect(await poster.post("u1", msg)).toEqual({ kind: "ok" });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://discord.com/api/webhooks/${target.id}/${target.token}`,
    );
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual" });
    expect(await poster.post("u1", msg)).toEqual({ kind: "gone" });
    expect(markGone).toHaveBeenCalledOnce();
  });

  it("has no channel when nothing is saved or the webhook is gone", async () => {
    const markGone = async () => {};
    expect(
      await new PlanDiscordPoster({ get: async () => null, markGone }).channel("u"),
    ).toBeNull();
    expect(
      await new PlanDiscordPoster({
        get: async () => ({ target, name: "den", gone: true }),
        markGone,
      }).channel("u"),
    ).toBeNull();
  });
});
