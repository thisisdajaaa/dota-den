import { describe, expect, it } from "vitest";
import { AppError } from "@/common/errors/app-error";
import type { StreamerFollow } from "@/modules/live/domain/streams";
import type { LiveStream } from "@/modules/live/domain/watch";
import type { Platform } from "@/modules/live/domain/platform";
import type {
  ChannelLookup,
  StreamDirectory,
  StreamerFollowsPort,
} from "@/modules/live/live.ports";
import { StreamerFollowService, streamerOwnerOf } from "@/modules/live/streamer-follows.service";

/** In-memory repository with the same owner scoping and upsert as the Mongo one. */
class FakeRepo implements StreamerFollowsPort {
  rows: StreamerFollow[] = [];
  async add(f: StreamerFollow) {
    const i = this.rows.findIndex(
      (r) => r.userId === f.userId && r.platform === f.platform && r.channelId === f.channelId,
    );
    if (i >= 0) {
      this.rows[i] = {
        ...this.rows[i],
        login: f.login,
        displayName: f.displayName,
        avatarUrl: f.avatarUrl,
      };
      return false;
    }
    this.rows.push(f);
    return true;
  }
  async remove(userId: string, platform: Platform, channelId: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (r) => !(r.userId === userId && r.platform === platform && r.channelId === channelId),
    );
    return this.rows.length < before;
  }
  async list(userId: string) {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async count(userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async find(userId: string, platform: Platform, channelId: string) {
    return (
      this.rows.find(
        (r) => r.userId === userId && r.platform === platform && r.channelId === channelId,
      ) ?? null
    );
  }
}

const channels: Record<string, { login: string; displayName: string }> = {
  "1": { login: "gorgc", displayName: "Gorgc" },
  "2": { login: "wagamama", displayName: "Wagamama" },
  "3": { login: "bububu", displayName: "BuBuBu" },
};

function fakeSite(
  platform: Platform,
  opts: { down?: boolean; live?: Record<string, number> } = {},
): StreamDirectory {
  return {
    platform,
    liveDotaStreams: async () => [],
    searchChannels: async () => [],
    channelById: async (id: string): Promise<ChannelLookup> => {
      if (opts.down) return { status: "unavailable" };
      const c = platform === "twitch" ? channels[id] : undefined;
      return c
        ? {
            status: "found",
            channel: {
              platform,
              id,
              ...c,
              avatarUrl: `https://static-cdn.jtvnw.net/${c.login}.png`,
            },
          }
        : { status: "not_found" };
    },
    liveByChannels: async (logins: readonly string[]) => {
      if (opts.down) return null;
      const live = new Map<string, LiveStream>();
      for (const l of logins)
        if (opts.live?.[l] !== undefined)
          live.set(l, {
            platform,
            channel: l,
            displayName: l,
            title: "t",
            viewers: opts.live[l],
            language: "en",
          });
      return live;
    },
  };
}
const fakeTwitch = (opts: Parameters<typeof fakeSite>[1] = {}) => fakeSite("twitch", opts);

const alice = streamerOwnerOf({ id: "alice", accountId32: 1 });
const bob = streamerOwnerOf({ id: "bob", accountId32: 2 });

function setup(directories: StreamDirectory[] = [fakeTwitch()], limit?: number) {
  const repository = new FakeRepo();
  let t = Date.parse("2026-10-01T00:00:00Z");
  const service = new StreamerFollowService({
    repository,
    directories,
    limit,
    now: () => new Date((t += 1000)),
  });
  return { repository, service };
}

const input = (
  channelId: string,
  login = "whatever",
  displayName = "Whatever",
  platform: Platform = "twitch",
) => ({
  platform,
  channelId,
  login,
  displayName,
});

describe("StreamerFollowService", () => {
  it("follows with Twitch's own names, idempotently", async () => {
    const { service, repository } = setup();
    // The request's names are only a fallback: Twitch's win.
    const first = await service.follow(alice, input("1", "spoofed", "Spoofed"));
    expect(first.created).toBe(true);
    expect(first.follow).toMatchObject({ channelId: "1", login: "gorgc", displayName: "Gorgc" });
    expect(first.follow.avatarUrl).toBe("https://static-cdn.jtvnw.net/gorgc.png");

    const again = await service.follow(alice, input("1"));
    expect(again.created).toBe(false);
    expect(again.follow.createdAt).toEqual(first.follow.createdAt);
    expect(repository.rows).toHaveLength(1);
  });

  it("refuses channels Twitch says don't exist", async () => {
    const { service } = setup();
    await expect(service.follow(alice, input("404"))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("falls back to the request's names when Twitch is down", async () => {
    const { service } = setup([fakeTwitch({ down: true })]);
    const { follow } = await service.follow(alice, input("77", "SomeOne", "SomeOne"));
    expect(follow).toMatchObject({ login: "someone", displayName: "SomeOne", avatarUrl: null });
  });

  it("caps how many channels one user follows, but re-following never counts", async () => {
    const { service } = setup([fakeTwitch()], 2);
    await service.follow(alice, input("1"));
    await service.follow(alice, input("2"));
    const over = service.follow(alice, input("3"));
    await expect(over).rejects.toBeInstanceOf(AppError);
    await expect(over).rejects.toMatchObject({ code: "conflict", details: { limit: 2 } });
    await expect(service.follow(alice, input("1"))).resolves.toMatchObject({ created: false });
    // Another user's limit is their own.
    await expect(service.follow(bob, input("3"))).resolves.toMatchObject({ created: true });
  });

  it("unfollows only the owner's follow", async () => {
    const { service } = setup();
    await service.follow(alice, input("1"));
    await service.follow(bob, input("1"));
    expect(await service.unfollow(alice, "twitch", "1")).toBe(true);
    expect(await service.unfollow(alice, "twitch", "1")).toBe(false);
    expect((await service.list(bob)).map((f) => f.channelId)).toEqual(["1"]);
  });

  it("lists followed channels live first, and unknown (not offline) when Twitch is down", async () => {
    const up = setup([fakeTwitch({ live: { wagamama: 300, bububu: 900 } })]);
    for (const id of ["1", "2", "3"]) await up.service.follow(alice, input(id));
    const rows = await up.service.following(alice);
    expect(rows.map((r) => [r.login, r.status])).toEqual([
      ["bububu", "live"],
      ["wagamama", "live"],
      ["gorgc", "offline"],
    ]);

    const down = setup([fakeTwitch({ down: true })]);
    await down.service.follow(alice, input("1", "gorgc", "Gorgc"));
    expect((await down.service.following(alice)).map((r) => r.status)).toEqual(["unknown"]);
    expect(await down.service.following(bob)).toEqual([]);
  });

  it("works without any site set up", async () => {
    const { service } = setup([]);
    await service.follow(alice, input("5", "five", "Five"));
    expect((await service.following(alice))[0].status).toBe("unknown");
  });

  it("keys follows by site: the same id on two sites is two follows", async () => {
    const { service } = setup([
      fakeTwitch({ live: { gorgc: 10 } }),
      fakeSite("kick", { down: true }),
    ]);
    await service.follow(alice, input("1"));
    // Kick is down: the request's names are kept.
    const kick = await service.follow(alice, input("1", "some-slug", "Some Slug", "kick"));
    expect(kick).toMatchObject({ created: true, follow: { platform: "kick", login: "some-slug" } });
    const rows = await service.following(alice);
    expect(rows.map((r) => [r.platform, r.status])).toEqual([
      ["twitch", "live"],
      ["kick", "unknown"],
    ]);
    expect(await service.unfollow(alice, "kick", "1")).toBe(true);
    expect((await service.list(alice)).map((f) => f.platform)).toEqual(["twitch"]);
  });
});
