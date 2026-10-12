import { describe, expect, it, vi } from "vitest";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import { toSteamId64, type AccountId32 } from "@/modules/identity/domain/steam-id";
import { LiveService } from "@/modules/live/live.service";
import type { LiveGame } from "@/modules/live/domain/live-game";
import {
  batches,
  friendHref,
  isPlayingDota,
  meaningfulSteamId,
  playingStatus,
  sortPlaying,
  type PlayingFriend,
  type SteamPresence,
} from "@/modules/presence/domain/presence";
import { SteamPresenceAdapter } from "@/modules/presence/infrastructure/steam-presence-adapter";
import type { FriendList, SteamPresenceSource } from "@/modules/presence/presence.ports";
import { PresenceService } from "@/modules/presence/presence.service";

const sid = (accountId32: number) => toSteamId64(accountId32 as AccountId32) as string;
const ME = { userId: "u1", accountId32: 1000, steamId64: sid(1000) };

const presence = (accountId32: number, over: Partial<SteamPresence> = {}): SteamPresence => ({
  steamId64: sid(accountId32),
  visibility: 3,
  personaState: 1,
  name: `Friend ${accountId32}`,
  avatarUrl: null,
  gameId: "570",
  gameServerSteamId: null,
  ...over,
});

describe("presence domain", () => {
  it("only public, online profiles in game 570 count as playing Dota 2", () => {
    expect(isPlayingDota(presence(1))).toBe(true);
    expect(isPlayingDota(presence(1, { visibility: 1 }))).toBe(false);
    expect(isPlayingDota(presence(1, { visibility: 2 }))).toBe(false);
    expect(isPlayingDota(presence(1, { personaState: 0 }))).toBe(false);
    expect(isPlayingDota(presence(1, { gameId: "730" }))).toBe(false);
    expect(isPlayingDota(presence(1, { gameId: null }))).toBe(false);
  });

  it("claims a match only with a game server or a live game", () => {
    expect(playingStatus(presence(1), null)).toBe("in_game");
    expect(playingStatus(presence(1, { gameServerSteamId: "90071992547409920" }), null)).toBe(
      "in_match",
    );
    expect(playingStatus(presence(1), "8000000002")).toBe("in_match");
    expect(meaningfulSteamId("0")).toBeNull();
    expect(meaningfulSteamId("")).toBeNull();
    expect(meaningfulSteamId(undefined)).toBeNull();
    expect(meaningfulSteamId("90071992547409920")).toBe("90071992547409920");
  });

  it("links to the live game when known, else the profile", () => {
    expect(friendHref({ accountId32: 5, liveMatchId: "8000000002" })).toBe("/live/8000000002");
    expect(friendHref({ accountId32: 5, liveMatchId: null })).toBe("/players/5");
  });

  it("batches up to 100 ids, sorted and deduplicated", () => {
    const ids = Array.from({ length: 250 }, (_, i) => sid(250 - i));
    const out = batches([...ids, ids[0]]);
    expect(out.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(out.flat()).toEqual([...ids].sort());
  });

  it("sorts friends in a match first, then by name", () => {
    const f = (accountId32: number, name: string | null, status: PlayingFriend["status"]) => ({
      accountId32,
      steamId64: sid(accountId32),
      name,
      avatarUrl: null,
      status,
      liveMatchId: null,
    });
    const sorted = sortPlaying([
      f(1, "zed", "in_game"),
      f(2, "Bob", "in_game"),
      f(3, "yan", "in_match"),
      f(4, "alice", "in_game"),
    ]);
    expect(sorted.map((x) => x.accountId32)).toEqual([3, 4, 2, 1]);
  });
});

function adapterWith(handler: (url: URL) => { status: number; body?: unknown }) {
  const fetch = vi.fn(async (url: string) => {
    const r = handler(new URL(url));
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
  const gateway = new ProviderGateway({
    name: "steam",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
  let now = 1_000_000;
  const adapter = new SteamPresenceAdapter(gateway, {
    baseUrl: "http://steam.test/",
    apiKey: "secret-key",
    now: () => now,
  });
  return { adapter, fetch, advance: (ms: number) => (now += ms) };
}

describe("SteamPresenceAdapter", () => {
  it("reads a public friend list and keeps only valid SteamIDs", async () => {
    const { adapter, fetch } = adapterWith(() => ({
      status: 200,
      body: {
        friendslist: {
          friends: [
            { steamid: sid(1), relationship: "friend", friend_since: 1 },
            { steamid: sid(1), relationship: "friend" },
            { steamid: "123", relationship: "friend" },
            { steamid: 76561197960265729, relationship: "friend" },
            { steamid: sid(2), relationship: "requestrecipient" },
          ],
        },
      },
    }));
    expect(await adapter.friendList(sid(1000))).toEqual({ kind: "public", steamIds: [sid(1)] });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/ISteamUser/GetFriendList/v1/");
    expect(url.searchParams.get("key")).toBe("secret-key");
    expect(url.searchParams.get("steamid")).toBe(sid(1000));
    expect(url.searchParams.get("relationship")).toBe("friend");
  });

  it("treats a 401 as a private list, remembers it and keeps the circuit closed", async () => {
    let calls = 0;
    const { adapter, fetch, advance } = adapterWith(() => {
      calls++;
      return { status: 401 };
    });
    for (let i = 0; i < 6; i++)
      expect(await adapter.friendList(sid(i + 1))).toEqual({ kind: "private" });
    // Remembered: no second request for the same account for a while.
    expect(await adapter.friendList(sid(1))).toEqual({ kind: "private" });
    expect(calls).toBe(6);
    advance(11 * 60_000);
    await adapter.friendList(sid(1));
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it("reports an unavailable friend list on server errors or bad payloads", async () => {
    expect(await adapterWith(() => ({ status: 500 })).adapter.friendList(sid(1))).toEqual({
      kind: "unavailable",
    });
    expect(
      await adapterWith(() => ({ status: 200, body: { friendslist: "nope" } })).adapter.friendList(
        sid(1),
      ),
    ).toEqual({ kind: "unavailable" });
  });

  it("parses summaries, hides what private profiles report and filters avatars", async () => {
    const { adapter, fetch } = adapterWith(() => ({
      status: 200,
      body: {
        response: {
          players: [
            {
              steamid: sid(1),
              communityvisibilitystate: 3,
              personastate: 1,
              personaname: "  Alpha  ",
              avatarfull: "https://avatars.steamstatic.com/abc_full.jpg",
              gameid: "570",
              gameserversteamid: "90071992547409920",
              lobbysteamid: "109775241000000000",
            },
            {
              steamid: sid(2),
              communityvisibilitystate: 1,
              personastate: 1,
              personaname: "Hidden",
              avatarfull: "https://evil.test/a.jpg",
              gameid: "570",
            },
            {
              steamid: sid(3),
              communityvisibilitystate: 3,
              personastate: 0,
              gameserversteamid: "0",
            },
            { steamid: "bad", communityvisibilitystate: 3 },
            null,
          ],
        },
      },
    }));
    const rows = await adapter.summaries([sid(3), sid(1), sid(2)]);
    expect(rows).toEqual([
      {
        steamId64: sid(1),
        visibility: 3,
        personaState: 1,
        name: "Alpha",
        avatarUrl: "https://avatars.steamstatic.com/abc_full.jpg",
        gameId: "570",
        gameServerSteamId: "90071992547409920",
      },
      {
        steamId64: sid(2),
        visibility: 1,
        personaState: 0,
        name: "Hidden",
        avatarUrl: null,
        gameId: null,
        gameServerSteamId: null,
      },
      {
        steamId64: sid(3),
        visibility: 3,
        personaState: 0,
        name: null,
        avatarUrl: null,
        gameId: null,
        gameServerSteamId: null,
      },
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/ISteamUser/GetPlayerSummaries/v2/");
    expect(url.searchParams.get("steamids")).toBe([sid(3), sid(1), sid(2)].join(","));
  });

  it("caches summaries for a minute and returns null when Steam fails", async () => {
    const ok = adapterWith(() => ({ status: 200, body: { response: { players: [] } } }));
    await ok.adapter.summaries([sid(1)]);
    await ok.adapter.summaries([sid(1)]);
    expect(ok.fetch).toHaveBeenCalledTimes(1);
    expect(await ok.adapter.summaries([])).toEqual([]);
    await expect(
      ok.adapter.summaries(Array.from({ length: 101 }, (_, i) => sid(i + 1))),
    ).rejects.toThrow();
    expect(await adapterWith(() => ({ status: 503 })).adapter.summaries([sid(1)])).toBeNull();
    expect(
      await adapterWith(() => ({ status: 200, body: { players: [] } })).adapter.summaries([sid(1)]),
    ).toBeNull();
  });
});

function serviceWith(opts: {
  list?: FriendList;
  online?: SteamPresence[];
  summariesFail?: boolean;
  tracked?: number[];
  teammates?: Array<{ accountId32: number; withGames: number }> | null;
  live?: Map<number, string>;
  steam?: false;
}) {
  const summaries = vi.fn(async (ids: readonly string[]) =>
    opts.summariesFail ? null : (opts.online ?? []).filter((p) => ids.includes(p.steamId64)),
  );
  const friendList = vi.fn(async () => opts.list ?? ({ kind: "private" } as const));
  const steam: SteamPresenceSource = { friendList, summaries };
  const liveMatchIds = vi.fn(async () => opts.live ?? new Map<number, string>());
  const teammates = vi.fn(async () => (opts.teammates === undefined ? [] : opts.teammates));
  const service = new PresenceService({
    steam: opts.steam === false ? null : steam,
    known: {
      tracked: async () => (opts.tracked ?? []).map((accountId32) => ({ accountId32 })),
      teammates,
    },
    live: { liveMatchIds },
    logger: { warn: vi.fn() },
  });
  return { service, summaries, friendList, liveMatchIds, teammates };
}

describe("PresenceService", () => {
  it("is disabled without a Steam Web API key and calls nothing", async () => {
    const { service, summaries, friendList } = serviceWith({ steam: false });
    expect(await service.playingNow(ME)).toEqual({ enabled: false, source: null, friends: [] });
    expect(summaries).not.toHaveBeenCalled();
    expect(friendList).not.toHaveBeenCalled();
  });

  it("checks Steam friends plus tracked players, never yourself", async () => {
    const { service, summaries, teammates } = serviceWith({
      list: { kind: "public", steamIds: [sid(1), sid(2), ME.steamId64] },
      tracked: [3, 1],
      online: [presence(1), presence(3, { gameId: "730" })],
    });
    const res = await service.playingNow(ME);
    expect(res).toEqual({
      enabled: true,
      source: "steam_friends",
      friends: [
        {
          accountId32: 1,
          name: "Friend 1",
          avatarUrl: null,
          status: "in_game",
          href: "/players/1",
          live: false,
        },
      ],
    });
    expect(summaries.mock.calls[0][0]).toEqual([sid(1), sid(2), sid(3)].sort());
    expect(teammates).not.toHaveBeenCalled();
  });

  it("falls back to tracked players and frequent teammates when the friend list is private", async () => {
    const { service, summaries } = serviceWith({
      list: { kind: "private" },
      tracked: [5],
      teammates: [
        { accountId32: 6, withGames: 40 },
        { accountId32: 7, withGames: 2 },
        { accountId32: 1000, withGames: 99 },
      ],
      online: [presence(5), presence(6, { gameServerSteamId: "90071992547409920" })],
    });
    const res = await service.playingNow(ME);
    expect(res.source).toBe("tracked_and_teammates");
    expect(summaries.mock.calls[0][0]).toEqual([sid(5), sid(6)].sort());
    expect(res.friends.map((f) => [f.accountId32, f.status])).toEqual([
      [6, "in_match"],
      [5, "in_game"],
    ]);
  });

  it("links friends found in the live feed to their game", async () => {
    const { service, liveMatchIds } = serviceWith({
      list: { kind: "public", steamIds: [sid(1), sid(2)] },
      online: [presence(1), presence(2)],
      live: new Map([[2, "8000000002"]]),
    });
    const res = await service.playingNow(ME);
    expect(liveMatchIds).toHaveBeenCalledWith([1, 2]);
    expect(res.friends[0]).toMatchObject({
      accountId32: 2,
      status: "in_match",
      href: "/live/8000000002",
      live: true,
    });
    expect(res.friends[1]).toMatchObject({ accountId32: 1, status: "in_game", live: false });
  });

  it("checks at most 300 friends, 100 per Steam call", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => sid(i + 1));
    const { service, summaries, liveMatchIds } = serviceWith({
      list: { kind: "public", steamIds: ids },
    });
    const res = await service.playingNow(ME);
    expect(res.friends).toEqual([]);
    expect(summaries).toHaveBeenCalledTimes(3);
    expect(summaries.mock.calls.every(([batch]) => batch.length === 100)).toBe(true);
    // Nobody playing: no live lookup.
    expect(liveMatchIds).not.toHaveBeenCalled();
  });

  it("shows nobody when Steam or the other sources fail, and never guesses", async () => {
    const failed = serviceWith({
      list: { kind: "public", steamIds: [sid(1)] },
      summariesFail: true,
    });
    expect((await failed.service.playingNow(ME)).friends).toEqual([]);

    const noTeammates = serviceWith({ list: { kind: "unavailable" }, teammates: null });
    expect(await noTeammates.service.playingNow(ME)).toEqual({
      enabled: true,
      source: "tracked_and_teammates",
      friends: [],
    });

    const liveDown = serviceWith({
      list: { kind: "public", steamIds: [sid(1)] },
      online: [presence(1)],
    });
    liveDown.liveMatchIds.mockRejectedValueOnce(new Error("down"));
    expect((await liveDown.service.playingNow(ME)).friends).toMatchObject([
      { accountId32: 1, status: "in_game", href: "/players/1" },
    ]);
  });

  it("ignores presence Steam returns for accounts it wasn't asked about", async () => {
    const { service } = serviceWith({ list: { kind: "public", steamIds: [sid(1)] } });
    const stray = serviceWith({ list: { kind: "public", steamIds: [sid(1)] } });
    stray.summaries.mockResolvedValueOnce([presence(1), presence(1), presence(9)]);
    expect((await service.playingNow(ME)).friends).toEqual([]);
    expect((await stray.service.playingNow(ME)).friends.map((f) => f.accountId32)).toEqual([1]);
  });
});

describe("LiveService.liveMatchIds", () => {
  const game = (matchId: string, accounts: Array<number | null>): LiveGame => ({
    matchId,
    leagueId: null,
    leagueName: null,
    teams: { radiant: null, dire: null },
    score: { radiant: 0, dire: 0 },
    radiantLead: 0,
    gameTimeSec: 0,
    delaySec: 0,
    averageMmr: null,
    spectators: 0,
    players: accounts.map((accountId32) => ({
      accountId32,
      name: null,
      heroId: 1,
      side: "radiant" as const,
      isPro: false,
    })),
    updatedAt: new Date(0),
  });

  it("maps accounts in the live feed to their match, and is empty when the feed is down", async () => {
    const games = vi.fn(async (): Promise<LiveGame[] | null> => [
      game("1", [10, null]),
      game("2", [20, 10]),
    ]);
    const live = new LiveService({ source: { games, leagueName: async () => null } });
    expect(await live.liveMatchIds([10, 20, 30])).toEqual(
      new Map([
        [10, "1"],
        [20, "2"],
      ]),
    );
    expect(await live.liveMatchIds([])).toEqual(new Map());
    games.mockResolvedValueOnce(null);
    expect(await live.liveMatchIds([10])).toEqual(new Map());
  });
});
