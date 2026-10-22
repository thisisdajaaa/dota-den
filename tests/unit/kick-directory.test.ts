import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharedCache } from "@/modules/live/infrastructure/directory-cache";
import { KickDirectory, slugCandidates } from "@/modules/live/infrastructure/kick-directory";
import { TwitchDirectory } from "@/modules/live/infrastructure/twitch-directory";
import type { LiveSource } from "@/modules/live/live.ports";
import { LiveService } from "@/modules/live/live.service";

const KICK = "https://kick.test";
const HELIX = "https://helix.test";
const IMAGES = "https://images.kick.com";
const FILES = "https://files.kick.com";

type Handler = (url: URL) => unknown;

/**
 * Fake Kick (and Helix) APIs: records request URLs and answers by path. A handler may return
 * a Response to answer with a status of its own.
 */
function fakeApis(
  kick: Record<string, Handler>,
  helix: Record<string, Handler> = {},
  opts: { tokens?: string[] } = {},
) {
  const calls: URL[] = [];
  const tokens = [...(opts.tokens ?? ["kick-token"])];
  let issued = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.href === `${KICK}/oauth/token`) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("grant_type")).toBe("client_credentials");
        issued++;
        return Response.json({
          access_token: tokens[Math.min(issued - 1, tokens.length - 1)],
          expires_in: 5_184_000,
          token_type: "Bearer",
        });
      }
      if (url.href === `${HELIX}/token`)
        return Response.json({ access_token: "twitch-token", expires_in: 3600 });
      calls.push(url);
      const table = url.origin === KICK ? kick : helix;
      const prefix = url.origin === KICK ? "/public/v1/" : "/";
      const handler = table[url.pathname.slice(prefix.length)];
      if (!handler) return new Response("nope", { status: 500 });
      const out = handler(url);
      if (out instanceof Response) return out;
      return Response.json(out);
    }),
  );
  return { calls, issued: () => issued };
}

const kick = (shared?: SharedCache) =>
  new KickDirectory({
    clientId: "id",
    clientSecret: "secret",
    apiBaseUrl: `${KICK}/public/v1`,
    authUrl: `${KICK}/oauth/token`,
    shared,
  });

const twitch = () =>
  new TwitchDirectory({
    clientId: "id",
    clientSecret: "secret",
    apiBaseUrl: HELIX,
    authUrl: `${HELIX}/token`,
  });

const livestream = (slug: string, viewers: number, id: number, extra: object = {}) => ({
  broadcaster_user_id: id,
  channel_id: id + 1000,
  slug,
  stream_title: `${slug} playing ranked`,
  language: "en",
  has_mature_content: false,
  viewer_count: viewers,
  thumbnail: `${IMAGES}/video_thumbnails/${slug}/480.webp`,
  started_at: "2026-10-22T14:04:15Z",
  category: { id: 14, name: "Dota 2", thumbnail: `${FILES}/c.jpg` },
  profile_picture: `${FILES}/images/user/${id}/profile_image/p.webp`,
  ...extra,
});

const channel = (slug: string, id: number, live: boolean, extra: object = {}) => ({
  broadcaster_user_id: id,
  slug,
  channel_description: "",
  banner_picture: "",
  stream: {
    url: "",
    key: "",
    is_live: live,
    is_mature: false,
    language: "en",
    start_time: live ? "2026-10-22T10:00:00Z" : "0001-01-01T00:00:00Z",
    viewer_count: live ? 42 : 0,
    thumbnail: live ? `${IMAGES}/video_thumbnails/${slug}/480.webp` : "",
  },
  stream_title: live ? `${slug} live` : "",
  category: { id: 14, name: "Dota 2" },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("KickDirectory", () => {
  it("lists Dota 2 streams without mature ones, skipping odd entries, cached for a minute", async () => {
    const { calls } = fakeApis({
      livestreams: () => ({
        data: [
          livestream("fissure_dota_en", 3805, 1),
          livestream("adult_corner", 900, 2, { has_mature_content: true }),
          { slug: "broken" },
          livestream("has spaces", 50, 3),
          livestream("ru-caster", 120, 4, {
            language: "",
            profile_picture: "https://evil.example/p.png",
            thumbnail: null,
          }),
        ],
        message: "OK",
      }),
    });
    const k = kick();
    const streams = await k.liveDotaStreams();
    expect(streams).toEqual([
      {
        platform: "kick",
        channel: "fissure_dota_en",
        displayName: "fissure_dota_en",
        title: "fissure_dota_en playing ranked",
        viewers: 3805,
        language: "en",
        userId: "1",
        thumbnailUrl: `${IMAGES}/video_thumbnails/fissure_dota_en/480.webp`,
        avatarUrl: `${FILES}/images/user/1/profile_image/p.webp`,
        startedAt: "2026-10-22T14:04:15Z",
        gameName: "Dota 2",
      },
      expect.objectContaining({
        channel: "ru-caster",
        language: "",
        // Images from anywhere but Kick's CDNs are dropped.
        avatarUrl: null,
        thumbnailUrl: null,
      }),
    ]);
    const q = calls[0].searchParams;
    expect([q.get("category_id"), q.get("limit"), q.get("sort")]).toEqual([
      "14",
      "100",
      "viewer_count",
    ]);
    await k.liveDotaStreams();
    expect(calls).toHaveLength(1);
  });

  it("shares the stream list through the shared cache", async () => {
    const store = new Map<string, string>();
    const shared: SharedCache = {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
    };
    const { calls } = fakeApis({ livestreams: () => ({ data: [livestream("a_b", 5, 1)] }) });
    await kick(shared).liveDotaStreams();
    expect(calls).toHaveLength(1);
    // Another server reads it from Redis instead of asking Kick.
    const other = await kick(shared).liveDotaStreams();
    expect(other?.map((s) => s.channel)).toEqual(["a_b"]);
    expect(calls).toHaveLength(1);
  });

  it("tries a query as a slug: as typed, with _ or - for spaces, or none", () => {
    expect(slugCandidates(" Bad Boy ")).toEqual(["bad_boy", "bad-boy", "badboy"]);
    expect(slugCandidates("gorgc")).toEqual(["gorgc"]);
    expect(slugCandidates("no/slash")).toEqual([]);
  });

  it("searches by exact slug first, then live Dota 2 streams naming the query", async () => {
    const { calls } = fakeApis({
      livestreams: () => ({
        data: [
          livestream("fissure_dota_en", 3805, 1, { stream_title: "PARIVISION vs Astra" }),
          livestream("pari_fan", 20, 2),
          livestream("quiet", 5, 3, { stream_title: "parivision watch party" }),
        ],
      }),
      channels: (url) => ({
        data: url.searchParams
          .getAll("slug")
          .filter((s) => s === "parivision")
          .map((s) => channel(s, 9, false)),
      }),
    });
    const k = kick();
    const hits = await k.searchChannels("PariVision", false);
    expect(hits?.map((h) => [h.login, h.live])).toEqual([
      ["parivision", false],
      ["fissure_dota_en", true],
      ["quiet", true],
    ]);
    expect(hits?.[0]).toEqual({
      platform: "kick",
      id: "9",
      login: "parivision",
      displayName: "parivision",
      // Kick's channel lookup has no picture; the UI shows initials.
      avatarUrl: null,
      live: false,
      title: "",
      gameName: "Dota 2",
      language: "en",
    });
    expect(hits?.[1].avatarUrl).toBe(`${FILES}/images/user/1/profile_image/p.webp`);
    const lookups = calls.filter((c) => c.pathname.endsWith("/channels"));
    expect(lookups[0].searchParams.getAll("slug")).toEqual(["parivision"]);

    // Cached, and live-only leaves offline channels out.
    await k.searchChannels("parivision", false);
    expect(calls.filter((c) => c.pathname.endsWith("/channels"))).toHaveLength(1);
    const live = await k.searchChannels("parivision", true);
    expect(live?.map((h) => h.login)).toEqual(["fissure_dota_en", "quiet"]);
  });

  it("finds an offline channel by name with spaces, trying each slug form", async () => {
    const { calls } = fakeApis({
      livestreams: () => ({ data: [] }),
      channels: () => ({ data: [channel("bad-boy", 5, true)] }),
    });
    const hits = await kick().searchChannels("bad boy", false);
    expect(hits?.map((h) => [h.login, h.live, h.title])).toEqual([
      ["bad-boy", true, "bad-boy live"],
    ]);
    const lookup = calls.find((c) => c.pathname.endsWith("/channels"));
    expect(lookup?.searchParams.getAll("slug")).toEqual(["bad_boy", "bad-boy", "badboy"]);
  });

  it("still searches the live list when the slug lookup fails, and returns null when both fail", async () => {
    fakeApis({
      livestreams: () => ({ data: [livestream("arteezy_fan", 10, 1)] }),
      channels: () => new Response("down", { status: 503 }),
    });
    const k = kick();
    expect((await k.searchChannels("arteezy", false))?.map((h) => h.login)).toEqual([
      "arteezy_fan",
    ]);

    fakeApis({});
    expect(await kick().searchChannels("arteezy", false)).toBeNull();
  });

  it("gets a new token once when Kick answers 401", async () => {
    let first = true;
    const { issued } = fakeApis(
      {
        livestreams: () => {
          if (first) {
            first = false;
            return new Response("expired", { status: 401 });
          }
          return { data: [livestream("a_b", 1, 1)] };
        },
      },
      {},
      { tokens: ["old", "new"] },
    );
    expect((await kick().liveDotaStreams())?.map((s) => s.channel)).toEqual(["a_b"]);
    expect(issued()).toBe(2);

    // A second 401 in a row is a failure, not a loop.
    const again = fakeApis({ livestreams: () => new Response("no", { status: 401 }) });
    expect(await kick().liveDotaStreams()).toBeNull();
    expect(again.issued()).toBe(2);
  });

  it("asks who is live by slug, remembering offline ones too", async () => {
    const { calls } = fakeApis({
      channels: (url) => ({
        data: url.searchParams
          .getAll("slug")
          .filter((s) => s.startsWith("on"))
          .map((s, i) => channel(s, 100 + i, s === "on1")),
      }),
    });
    const k = kick();
    const slugs = Array.from({ length: 60 }, (_, i) => `on${i + 1}`);
    const live = await k.liveByChannels([...slugs, "gone"]);
    expect([...(live?.keys() ?? [])]).toEqual(["on1"]);
    expect(live?.get("on1")).toMatchObject({ platform: "kick", viewers: 42, title: "on1 live" });
    expect(calls.map((c) => c.searchParams.getAll("slug").length)).toEqual([50, 11]);
    await k.liveByChannels(["ON1", "gone"]);
    expect(calls).toHaveLength(2);
  });

  it("looks up a channel by its user id, with the picture when it's live", async () => {
    const { calls } = fakeApis({
      channels: (url) => ({
        data: [channel("fissure_dota_en", 1, true), channel("sleepy", 2, false)].filter(
          (c) => String(c.broadcaster_user_id) === url.searchParams.get("broadcaster_user_id"),
        ),
      }),
      livestreams: (url) => ({
        data:
          url.searchParams.get("broadcaster_user_id") === "1"
            ? [livestream("fissure_dota_en", 10, 1)]
            : [],
      }),
    });
    const k = kick();
    expect(await k.channelById("1")).toEqual({
      status: "found",
      channel: {
        platform: "kick",
        id: "1",
        login: "fissure_dota_en",
        displayName: "fissure_dota_en",
        avatarUrl: `${FILES}/images/user/1/profile_image/p.webp`,
      },
    });
    expect(await k.channelById("2")).toEqual({
      status: "found",
      channel: expect.objectContaining({ login: "sleepy", avatarUrl: null }),
    });
    expect(await k.channelById("3")).toEqual({ status: "not_found" });
    // Offline channels don't cost a second request.
    expect(calls.filter((c) => c.pathname.endsWith("/livestreams"))).toHaveLength(1);
  });

  it("returns null, not empty, when Kick fails", async () => {
    fakeApis({});
    const k = kick();
    expect(await k.liveDotaStreams()).toBeNull();
    expect(await k.searchChannels("x y", false)).toBeNull();
    expect(await k.liveByChannels(["a"])).toBeNull();
    expect(await k.channelById("1")).toEqual({ status: "unavailable" });
  });
});

describe("LiveService with Twitch and Kick", () => {
  const source: LiveSource = { games: async () => [], leagueName: async () => null };
  const helix = {
    streams: () => ({
      data: [
        {
          user_id: "7",
          user_login: "gorgc",
          user_name: "Gorgc",
          title: "pubs",
          viewer_count: 2000,
          language: "en",
        },
      ],
    }),
    users: () => ({ data: [] }),
    "search/channels": (url: URL) => ({
      data: "gorgc".includes(url.searchParams.get("query") ?? "")
        ? [{ id: "7", broadcaster_login: "gorgc", display_name: "Gorgc", is_live: false }]
        : [],
    }),
  };
  const kickApi = {
    livestreams: () => ({
      data: [livestream("fissure_dota_en", 3805, 1), livestream("small_kick", 10, 2)],
    }),
    channels: () => ({ data: [] }),
  };

  it("mixes both sites' streams, most watched first", async () => {
    fakeApis(kickApi, helix);
    const service = new LiveService({ source, directories: [twitch(), kick()] });
    const hub = await service.hub();
    expect(hub.streams?.map((s) => `${s.platform}:${s.channel}`)).toEqual([
      "kick:fissure_dota_en",
      "twitch:gorgc",
      "kick:small_kick",
    ]);
  });

  it("still shows Twitch when Kick is down, and Kick when Twitch is down", async () => {
    fakeApis({}, helix);
    const kickDown = await new LiveService({ source, directories: [twitch(), kick()] }).hub();
    expect(kickDown.streams?.map((s) => s.platform)).toEqual(["twitch"]);

    fakeApis(kickApi, {});
    const twitchDown = await new LiveService({ source, directories: [twitch(), kick()] }).hub();
    expect(twitchDown.streams?.map((s) => s.channel)).toEqual(["fissure_dota_en", "small_kick"]);
  });

  it("searches both sites and survives one failing", async () => {
    fakeApis(kickApi, helix);
    const both = new LiveService({ source, directories: [twitch(), kick()] });
    expect((await both.searchChannels("fissure", false)).map((h) => h.platform)).toEqual(["kick"]);
    expect((await both.searchChannels("gorgc", false)).map((h) => h.platform)).toEqual(["twitch"]);

    fakeApis({}, helix);
    const kickDown = new LiveService({ source, directories: [twitch(), kick()] });
    expect((await kickDown.searchChannels("gorgc", false)).map((h) => h.login)).toEqual(["gorgc"]);
  });
});
