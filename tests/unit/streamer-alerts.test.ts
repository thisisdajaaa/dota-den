import { describe, expect, it, vi } from "vitest";
import { alertKey, ALERT_MAX_AGE_MS, isFreshStart } from "@/modules/live/domain/alerts";
import type { StreamerFollow } from "@/modules/live/domain/streams";
import type { LiveStream } from "@/modules/live/domain/watch";
import type { StreamDirectory } from "@/modules/live/live.ports";
import { StreamerAlertsService, type AlertMessage } from "@/modules/live/streamer-alerts.service";

const NOW = new Date("2026-10-23T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("go-live alert rules", () => {
  it.each([
    ["just started", minutesAgo(2), true],
    ["at the edge", new Date(NOW.getTime() - ALERT_MAX_AGE_MS).toISOString(), true],
    ["too long ago", new Date(NOW.getTime() - ALERT_MAX_AGE_MS - 1).toISOString(), false],
    ["slightly in the future (clock skew)", new Date(NOW.getTime() + 60_000).toISOString(), true],
    ["far in the future", new Date(NOW.getTime() + 10 * 60_000).toISOString(), false],
    ["unknown start", null, true],
    ["unparseable start", "yesterday", true],
  ])("%s", (_n, startedAt, fresh) => {
    expect(isFreshStart(startedAt, NOW)).toBe(fresh);
  });

  it("keys one alert per channel per stream session", () => {
    const a = alertKey("twitch", "42", "2026-10-23T11:58:00Z", NOW);
    expect(a).toBe("twitch:42:2026-10-23T11:58:00.000Z");
    expect(alertKey("twitch", "42", "2026-10-23T11:58:00.000Z", NOW)).toBe(a);
    expect(alertKey("twitch", "42", "2026-10-23T18:00:00Z", NOW)).not.toBe(a);
    expect(alertKey("kick", "42", "2026-10-23T11:58:00Z", NOW)).not.toBe(a);
    expect(alertKey("kick", "7", null, NOW)).toBe("kick:7:day-2026-10-23");
  });
});

const follow = (userId: string, login: string, platform: "twitch" | "kick" = "twitch") =>
  ({
    userId,
    platform,
    channelId: `${login}-id`,
    login,
    displayName: login,
    avatarUrl: null,
    createdAt: NOW,
  }) satisfies StreamerFollow;

const stream = (channel: string, startedAt = minutesAgo(3)): LiveStream => ({
  platform: "twitch",
  channel,
  displayName: channel.toUpperCase(),
  title: "Ranked grind",
  viewers: 10,
  language: "en",
  startedAt,
});

function directory(live: Record<string, LiveStream>, platform: "twitch" | "kick" = "twitch") {
  return {
    platform,
    liveDotaStreams: vi.fn(),
    searchChannels: vi.fn(),
    channelById: vi.fn(),
    liveByChannels: vi.fn(async (logins: readonly string[]) => {
      const out = new Map<string, LiveStream>();
      for (const l of logins) if (live[l]) out.set(l, live[l]);
      return out;
    }),
  } satisfies StreamDirectory;
}

function setup(
  over: {
    plus?: string[];
    devices?: string[];
    wants?: Record<string, boolean>;
    follows?: StreamerFollow[];
    directories?: StreamDirectory[];
    enabled?: boolean;
  } = {},
) {
  const sent = new Map<string, AlertMessage>();
  const notifications = {
    enabled: over.enabled ?? true,
    subscribedUserIds: vi.fn(async () => over.devices ?? ["u1", "u2"]),
    wants: vi.fn(async (id: string) => over.wants?.[id] ?? true),
    notifyOnce: vi.fn(
      async (userId: string, key: string, build: () => Promise<AlertMessage | null>) => {
        const k = `${userId}|${key}`;
        if (sent.has(k)) return 0;
        const m = await build();
        if (!m) return 0;
        sent.set(k, m);
        return 1;
      },
    ),
  };
  const follows = {
    forUsers: vi.fn(async (ids: readonly string[]) =>
      (over.follows ?? []).filter((f) => ids.includes(f.userId)),
    ),
  };
  const plusUserIds = vi.fn(async () => over.plus ?? ["u1"]);
  const dirs = over.directories ?? [directory({ gorgc: stream("gorgc") })];
  const service = new StreamerAlertsService({
    plusUserIds,
    notifications,
    follows,
    directories: dirs,
    languages: async (ids) => new Map(ids.map((id) => [id, id === "u2" ? "fil" : null])),
    logger: { warn: vi.fn() },
    now: () => NOW,
  });
  return { service, sent, notifications, follows, plusUserIds, dirs };
}

describe("StreamerAlertsService", () => {
  it("is a no-op without push keys, without Plus players or without sites", async () => {
    const off = setup({ enabled: false });
    expect((await off.service.run()).skipped).toBe("disabled");
    expect(off.plusUserIds).not.toHaveBeenCalled();

    const nobody = setup({ plus: [] });
    expect((await nobody.service.run()).skipped).toBe("no_plus_users");
    expect(nobody.notifications.subscribedUserIds).not.toHaveBeenCalled();
    expect(nobody.follows.forUsers).not.toHaveBeenCalled();

    expect((await setup({ directories: [] }).service.run()).skipped).toBe("no_sites");
  });

  it("skips Plus players without a device or who turned the alerts off", async () => {
    const noDevice = setup({ devices: ["someone-else"], follows: [follow("u1", "gorgc")] });
    expect((await noDevice.service.run()).skipped).toBe("no_devices");
    const optedOut = setup({ wants: { u1: false }, follows: [follow("u1", "gorgc")] });
    expect((await optedOut.service.run()).skipped).toBe("no_devices");
    expect(optedOut.dirs[0].liveByChannels).not.toHaveBeenCalled();
  });

  it("sends one push per channel per stream session, in the player's language", async () => {
    const { service, sent, dirs } = setup({
      plus: ["u1", "u2"],
      follows: [follow("u1", "gorgc"), follow("u1", "offline"), follow("u2", "gorgc")],
    });
    const first = await service.run();
    expect(first).toMatchObject({ users: 2, channels: 2, live: 1, sent: 2, failed: 0 });
    // One request per site for every distinct channel.
    expect(dirs[0].liveByChannels).toHaveBeenCalledTimes(1);
    expect(dirs[0].liveByChannels).toHaveBeenCalledWith(["gorgc", "offline"]);
    expect([...sent.values()].map((m) => m.title)).toEqual(["GORGC is live", "Live na si GORGC"]);
    expect([...sent.values()][0]).toMatchObject({ body: "Ranked grind", url: "/live" });
    // The next run sees the same stream: nothing new.
    expect((await service.run()).sent).toBe(0);
  });

  it("never announces a stream that has been on for a long time, or a non-Plus player's follows", async () => {
    const { service, sent, follows } = setup({
      plus: ["u1"],
      follows: [follow("u1", "old"), follow("u2", "gorgc")],
      directories: [directory({ old: stream("old", minutesAgo(180)), gorgc: stream("gorgc") })],
    });
    expect((await service.run()).sent).toBe(0);
    expect(sent.size).toBe(0);
    expect(follows.forUsers).toHaveBeenCalledWith(["u1"]);
  });

  it("carries on when one site is down", async () => {
    const down = directory({}, "kick");
    down.liveByChannels.mockResolvedValueOnce(null as never);
    const { service, sent } = setup({
      follows: [follow("u1", "gorgc"), follow("u1", "kicker", "kick")],
      directories: [directory({ gorgc: stream("gorgc") }), down],
    });
    expect((await service.run()).sent).toBe(1);
    expect(sent.size).toBe(1);
  });
});
