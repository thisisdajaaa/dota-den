import { afterEach, describe, expect, it, vi } from "vitest";
import { TwitchDirectory } from "@/modules/live/infrastructure/twitch-directory";

const BASE = "https://helix.test";
const CDN = "https://static-cdn.jtvnw.net";

/** A fake Helix: records request URLs and answers by path. */
function fakeHelix(handlers: Record<string, (url: URL) => unknown>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname === "/token")
        return Response.json({ access_token: "token", expires_in: 3600 });
      calls.push(url);
      const handler = handlers[url.pathname.replace(/^\//, "")];
      return handler ? Response.json(handler(url)) : new Response("nope", { status: 500 });
    }),
  );
  return calls;
}

const directory = () =>
  new TwitchDirectory({
    clientId: "id",
    clientSecret: "secret",
    apiBaseUrl: BASE,
    authUrl: `${BASE}/token`,
  });

const helixStream = (login: string, viewers: number, id = login) => ({
  user_id: id,
  user_login: login,
  user_name: login.toUpperCase(),
  title: `${login} title`,
  viewer_count: viewers,
  language: "en",
  thumbnail_url: `${CDN}/previews-ttv/live_user_${login}-{width}x{height}.jpg`,
  game_name: "Dota 2",
});

afterEach(() => vi.unstubAllGlobals());

describe("TwitchDirectory", () => {
  it("lists Dota 2 streams with avatars, cached for a minute", async () => {
    const calls = fakeHelix({
      streams: () => ({ data: [helixStream("a", 10, "1"), helixStream("b", 5, "2")] }),
      users: (url) => ({
        data: url.searchParams.getAll("id").map((id) => ({
          id,
          login: `u${id}`,
          display_name: `U${id}`,
          profile_image_url: id === "1" ? `${CDN}/a.png` : "https://evil.example/b.png",
        })),
      }),
    });
    const twitch = directory();
    const streams = await twitch.liveDotaStreams();
    expect(streams?.map((s) => [s.platform, s.channel, s.avatarUrl])).toEqual([
      ["twitch", "a", `${CDN}/a.png`],
      // Images from anywhere but Twitch's CDN are dropped.
      ["twitch", "b", null],
    ]);
    expect(calls[0].searchParams.get("game_id")).toBe("29595");
    await twitch.liveDotaStreams();
    expect(calls.filter((c) => c.pathname === "/streams")).toHaveLength(1);
  });

  it("searches channels and caches each query briefly", async () => {
    const calls = fakeHelix({
      "search/channels": () => ({
        data: [
          {
            id: "9",
            broadcaster_login: "gorgc",
            display_name: "Gorgc",
            is_live: true,
            title: "pubs",
            game_name: "Dota 2",
            broadcaster_language: "en",
            thumbnail_url: `${CDN}/g.png`,
          },
        ],
      }),
    });
    const twitch = directory();
    const hits = await twitch.searchChannels("Gorgc ", true);
    expect(hits).toEqual([
      {
        platform: "twitch",
        id: "9",
        login: "gorgc",
        displayName: "Gorgc",
        avatarUrl: `${CDN}/g.png`,
        live: true,
        title: "pubs",
        gameName: "Dota 2",
        language: "en",
      },
    ]);
    expect(calls[0].searchParams.get("query")).toBe("gorgc");
    expect(calls[0].searchParams.get("live_only")).toBe("true");
    await twitch.searchChannels("gorgc", true);
    expect(calls).toHaveLength(1);
    // Live-only and all-channels searches are cached separately.
    await twitch.searchChannels("gorgc", false);
    expect(calls).toHaveLength(2);
  });

  it("asks who is live in batches of 100 logins, remembering offline ones too", async () => {
    const calls = fakeHelix({
      streams: (url) => ({
        data: url.searchParams
          .getAll("user_login")
          .filter((l) => l === "on1" || l === "on150")
          .map((l) => helixStream(l, 3)),
      }),
    });
    const twitch = directory();
    const logins = Array.from({ length: 150 }, (_, i) => `on${i + 1}`);
    const live = await twitch.liveByChannels(logins);
    expect([...(live?.keys() ?? [])].sort()).toEqual(["on1", "on150"]);
    expect(calls.map((c) => c.searchParams.getAll("user_login").length)).toEqual([100, 50]);
    await twitch.liveByChannels(["ON1", "on2"]);
    expect(calls).toHaveLength(2);
  });

  it("returns null, not empty, when Twitch fails", async () => {
    fakeHelix({});
    const twitch = directory();
    expect(await twitch.liveDotaStreams()).toBeNull();
    expect(await twitch.searchChannels("x", false)).toBeNull();
    expect(await twitch.liveByChannels(["a"])).toBeNull();
    expect(await twitch.channelById("1")).toEqual({ status: "unavailable" });
  });

  it("looks up a channel by id", async () => {
    fakeHelix({
      users: (url) => ({
        data:
          url.searchParams.get("id") === "1"
            ? [{ id: "1", login: "gorgc", display_name: "Gorgc" }]
            : [],
      }),
    });
    const twitch = directory();
    expect(await twitch.channelById("1")).toEqual({
      status: "found",
      channel: {
        platform: "twitch",
        id: "1",
        login: "gorgc",
        displayName: "Gorgc",
        avatarUrl: null,
      },
    });
    expect(await twitch.channelById("2")).toEqual({ status: "not_found" });
  });
});
