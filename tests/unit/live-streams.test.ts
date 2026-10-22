import { describe, expect, it } from "vitest";
import {
  channelKey,
  channelUrl,
  embedUrls,
  parseChannelName,
  parseWatchParam,
  platformImage,
  watchParam,
} from "@/modules/live/domain/platform";
import {
  batches,
  byViewers,
  compactCount,
  followingRow,
  hintLabel,
  inLanguage,
  languageOptions,
  mergeStreams,
  thumbnail,
  languageCode,
} from "@/modules/live/domain/streams";
import type { LiveStream } from "@/modules/live/domain/watch";

const stream = (
  channel: string,
  viewers: number,
  language = "en",
  platform: LiveStream["platform"] = "twitch",
): LiveStream => ({
  platform,
  channel,
  displayName: channel,
  title: `${channel} stream`,
  viewers,
  language,
});

describe("platforms", () => {
  it("accepts each site's channel names only, in lower case", () => {
    expect(parseChannelName("twitch", "Gorgc")).toBe("gorgc");
    expect(parseChannelName("twitch", " wagamama_tv ")).toBe("wagamama_tv");
    expect(parseChannelName("twitch", "has-hyphen")).toBeNull();
    expect(parseChannelName("kick", "has-hyphen")).toBe("has-hyphen");
    expect(parseChannelName("twitch", "bad login")).toBeNull();
    expect(parseChannelName("twitch", "x".repeat(26))).toBeNull();
    expect(parseChannelName("twitch", "../etc")).toBeNull();
    expect(parseChannelName("twitch", null)).toBeNull();
  });

  it("reads ?watch= as Twitch by default and site-prefixed otherwise", () => {
    expect(parseWatchParam("Gorgc")).toEqual({ platform: "twitch", channel: "gorgc" });
    expect(parseWatchParam("twitch:gorgc")).toEqual({ platform: "twitch", channel: "gorgc" });
    expect(parseWatchParam("kick:some-slug")).toEqual({ platform: "kick", channel: "some-slug" });
    expect(parseWatchParam("youtube:x")).toBeNull();
    expect(parseWatchParam("twitch:bad-name")).toBeNull();
    expect(parseWatchParam("")).toBeNull();
    expect(parseWatchParam(null)).toBeNull();
    expect(watchParam({ platform: "twitch", channel: "Gorgc" })).toBe("gorgc");
    expect(watchParam({ platform: "kick", channel: "slug" })).toBe("kick:slug");
    expect(channelKey("kick", "Slug")).toBe("kick:slug");
  });

  it("embeds Twitch with this page as the parent, and Kick without a chat", () => {
    expect(embedUrls("twitch", "gorgc", "www.dota-den.com")).toEqual({
      player: "https://player.twitch.tv/?channel=gorgc&parent=www.dota-den.com&autoplay=true",
      chat: "https://www.twitch.tv/embed/gorgc/chat?parent=www.dota-den.com&darkpopout",
    });
    expect(embedUrls("kick", "slug", "localhost")).toEqual({
      player: "https://player.kick.com/slug",
      chat: null,
    });
    expect(channelUrl("twitch", "gorgc")).toBe("https://www.twitch.tv/gorgc");
    expect(channelUrl("kick", "slug")).toBe("https://kick.com/slug");
  });

  it("keeps only https images from the sites' CDNs", () => {
    const ok = "https://static-cdn.jtvnw.net/jtv_user_pictures/a.png";
    expect(platformImage(ok)).toBe(ok);
    expect(platformImage("https://files.kick.com/images/a.webp")).toBe(
      "https://files.kick.com/images/a.webp",
    );
    expect(platformImage("http://static-cdn.jtvnw.net/a.png")).toBeNull();
    expect(platformImage("https://evil.example/a.png")).toBeNull();
    expect(platformImage("https://jtvnw.net.evil.example/a.png")).toBeNull();
    expect(platformImage("not a url")).toBeNull();
    expect(platformImage(undefined)).toBeNull();
  });

  it("fills the preview size into the thumbnail template", () => {
    expect(
      thumbnail(
        "https://static-cdn.jtvnw.net/previews-ttv/live_user_a-{width}x{height}.jpg",
        440,
        248,
      ),
    ).toBe("https://static-cdn.jtvnw.net/previews-ttv/live_user_a-440x248.jpg");
    expect(thumbnail(null, 1, 1)).toBeNull();
  });
});

describe("stream lists", () => {
  it("sorts by viewers, ties by site and channel", () => {
    const sorted = byViewers([
      stream("b", 10),
      stream("a", 10),
      stream("a", 10, "en", "kick"),
      stream("c", 99),
    ]);
    expect(sorted.map((s) => `${s.platform}:${s.channel}`)).toEqual([
      "twitch:c",
      "kick:a",
      "twitch:a",
      "twitch:b",
    ]);
  });

  it("merges sites into one list, skipping sites that didn't answer", () => {
    const merged = mergeStreams([
      [stream("a", 5), stream("same", 1)],
      null,
      [stream("same", 50, "en", "kick"), stream("b", 9, "en", "kick")],
    ]);
    expect(merged.map((s) => `${s.platform}:${s.channel}`)).toEqual([
      "kick:same",
      "kick:b",
      "twitch:a",
      "twitch:same",
    ]);
  });

  it('treats Twitch\'s "tl" and Kick\'s "fil" as one language', () => {
    expect(languageCode("TL")).toBe("fil");
    expect(languageCode("fil")).toBe("fil");
    expect(languageCode("")).toBe("other");
    // Regional variants count as their base language, whatever the separator or case.
    expect(languageCode("zh-hk")).toBe("zh");
    expect(languageCode("zh_TW")).toBe("zh");
    expect(languageCode("pt-BR")).toBe("pt");
    expect(languageCode("EN-gb")).toBe("en");
    expect(languageCode("tl-PH")).toBe("fil");
    expect(languageCode(" ru ")).toBe("ru");
    expect(languageCode("-")).toBe("other");
    const streams = [
      { language: "tl" },
      { language: "fil" },
      { language: "en" },
      { language: "zh-hk" },
      { language: "zh" },
      { language: "zh-tw" },
    ];
    expect(languageOptions(streams)).toEqual([
      { code: "zh", streams: 3 },
      { code: "fil", streams: 2 },
      { code: "en", streams: 1 },
    ]);
    expect(inLanguage(streams, "zh")).toHaveLength(3);
    expect(inLanguage(streams, "fil")).toHaveLength(2);
  });

  it("lists languages by number of streams and filters by one", () => {
    const streams = [
      stream("a", 1, "en"),
      stream("b", 2, "ru"),
      stream("c", 3, "RU"),
      stream("d", 4, ""),
    ];
    expect(languageOptions(streams)).toEqual([
      { code: "ru", streams: 2 },
      { code: "en", streams: 1 },
      { code: "other", streams: 1 },
    ]);
    expect(inLanguage(streams, "ru").map((s) => s.channel)).toEqual(["b", "c"]);
    expect(inLanguage(streams, "other").map((s) => s.channel)).toEqual(["d"]);
    expect(inLanguage(streams, null)).toHaveLength(4);
  });

  it("formats viewer counts compactly", () => {
    expect(compactCount(950)).toBe("950");
    expect(compactCount(1_000)).toBe("1K");
    expect(compactCount(12_345)).toBe("12K");
    expect(compactCount(1_250)).toBe("1.3K");
    expect(compactCount(2_400_000)).toBe("2.4M");
    expect(compactCount(-5)).toBe("0");
  });

  it("splits into Helix-sized batches", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 100)).toEqual([]);
  });

  it("names a game guess by its matchup, else its league", () => {
    expect(hintLabel({ radiant: "OG", dire: "Spirit", leagueName: "TI" })).toEqual({
      kind: "versus",
      radiant: "OG",
      dire: "Spirit",
    });
    expect(hintLabel({ radiant: "OG", dire: null, leagueName: "TI" })).toEqual({
      kind: "league",
      name: "TI",
    });
    expect(hintLabel({ radiant: null, dire: null, leagueName: null })).toBeNull();
  });
});

describe("followingRow", () => {
  const follow = (
    channelId: string,
    login: string,
    platform: LiveStream["platform"] = "twitch",
  ) => ({
    platform,
    channelId,
    login,
    displayName: login,
    avatarUrl: null,
    createdAt: new Date(0),
  });
  const follows = [
    follow("1", "zed"),
    follow("2", "Alpha"),
    follow("3", "mid"),
    follow("4", "big"),
    follow("5", "kicker", "kick"),
  ];

  it("puts live channels first (most watched), then the rest by name", () => {
    const twitch = new Map([
      ["mid", stream("mid", 50)],
      ["big", stream("big", 900)],
    ]);
    const kick = new Map([["kicker", stream("kicker", 70, "en", "kick")]]);
    const rows = followingRow(follows, { twitch, kick });
    expect(rows.map((r) => [r.platform, r.login, r.status])).toEqual([
      ["twitch", "big", "live"],
      ["kick", "kicker", "live"],
      ["twitch", "mid", "live"],
      ["twitch", "Alpha", "offline"],
      ["twitch", "zed", "offline"],
    ]);
    expect(rows[0].stream?.viewers).toBe(900);
  });

  it("never calls a channel offline when its site couldn't be asked", () => {
    const rows = followingRow(follows, { twitch: new Map(), kick: null });
    expect(rows.find((r) => r.platform === "kick")?.status).toBe("unknown");
    expect(rows.filter((r) => r.platform === "twitch").every((r) => r.status === "offline")).toBe(
      true,
    );
    // A site that isn't set up at all is unknown too.
    expect(followingRow(follows, {}).every((r) => r.status === "unknown")).toBe(true);
  });
});
