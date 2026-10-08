import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFS,
  isGoneStatus,
  isPushServiceEndpoint,
  isRecentPatch,
  isRecapDay,
  isRecentSession,
  isSessionFinished,
  weekStart,
  type NotificationKind,
  type NotificationMessage,
  type NotificationPrefs,
} from "@/modules/notifications/domain/notification";
import type {
  LatestSessionSource,
  NotificationLogPort,
  PushSender,
  SettingsRepositoryPort,
  StoredSubscription,
  SubscriptionsRepositoryPort,
} from "@/modules/notifications/notifications.ports";
import { NotificationService } from "@/modules/notifications/services/notification.service";
import { NotificationTriggersService } from "@/modules/notifications/services/notification-triggers.service";

const HOUR = 3_600_000;

describe("notification rules", () => {
  it("treats a session as finished only after the player's break length", () => {
    const end = new Date("2026-10-08T15:00:00Z");
    expect(isSessionFinished(end, 60, new Date(end.getTime() + 59 * 60_000))).toBe(false);
    expect(isSessionFinished(end, 60, new Date(end.getTime() + 61 * 60_000))).toBe(true);
  });

  it("only recaps sessions from about the last day", () => {
    const now = new Date("2026-10-09T06:30:00Z");
    expect(isRecentSession(new Date(now.getTime() - 20 * HOUR), now)).toBe(true);
    expect(isRecentSession(new Date(now.getTime() - 40 * HOUR), now)).toBe(false);
  });

  it("runs weeks Monday to Sunday and sends the weekly recap on Mondays", () => {
    expect(weekStart("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(weekStart("2026-10-08")).toBe("2026-10-05");
    expect(isRecapDay("2026-10-12")).toBe(true);
    expect(isRecapDay("2026-10-11")).toBe(false);
  });

  it("only accepts the browsers' push services as endpoints", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGt",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ])
      expect(isPushServiceEndpoint(ok)).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "not a url",
    ])
      expect(isPushServiceEndpoint(bad)).toBe(false);
    expect(isPushServiceEndpoint("https://127.0.0.1:9/push", ["127.0.0.1"])).toBe(true);
  });

  it("treats a patch as news for a week", () => {
    const now = new Date("2026-10-09T06:30:00Z");
    expect(isRecentPatch(new Date("2026-10-03T00:00:00Z"), now)).toBe(true);
    expect(isRecentPatch(new Date("2026-09-30T00:00:00Z"), now)).toBe(false);
  });

  it("forgets a device only when the push service says it is gone", () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});

function fakes(opts: { devices?: number; sender?: PushSender | null } = {}) {
  const subs = new Map<string, StoredSubscription>();
  for (let i = 0; i < (opts.devices ?? 1); i++)
    subs.set(`https://push.example/${i}`, {
      endpoint: `https://push.example/${i}`,
      userId: "u1",
      keys: { p256dh: "p", auth: "a" },
    });
  const prefs = new Map<string, NotificationPrefs>();
  const log = new Set<string>();
  const subscriptions: SubscriptionsRepositoryPort = {
    save: async (s) => void subs.set(s.endpoint, s),
    remove: async (userId, endpoint) =>
      subs.get(endpoint)?.userId === userId ? subs.delete(endpoint) : false,
    removeEndpoint: async (endpoint) => void subs.delete(endpoint),
    forUser: async (userId) => [...subs.values()].filter((s) => s.userId === userId),
    subscribedUserIds: async () => [...new Set([...subs.values()].map((s) => s.userId))],
    markSent: async () => {},
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  const settings: SettingsRepositoryPort = {
    prefs: async (id) => prefs.get(id) ?? null,
    savePrefs: async (id, p) => void prefs.set(id, p),
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  const logPort: NotificationLogPort = {
    claim: async (u, k, key) => {
      const id = `${u}:${k}:${key}`;
      if (log.has(id)) return false;
      log.add(id);
      return true;
    },
    release: async (u, k, key) => void log.delete(`${u}:${k}:${key}`),
    recordDelivered: async () => {},
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  const sent: Array<{ endpoint: string; message: NotificationMessage }> = [];
  const sender: PushSender =
    opts.sender === undefined
      ? {
          send: async (sub, message) => {
            sent.push({ endpoint: sub.endpoint, message });
            return { ok: true };
          },
        }
      : (opts.sender as PushSender);
  const service = new NotificationService({
    subscriptions,
    settings,
    log: logPort,
    sender: opts.sender === null ? null : sender,
  });
  return { service, subs, prefs, log, sent };
}

const message: NotificationMessage = { title: "t", body: "b", url: "/dashboard", tag: "x" };

describe("NotificationService", () => {
  it("sends each piece of news once, to every device", async () => {
    const { service, sent } = fakes({ devices: 2 });
    expect(await service.notifyOnce("u1", "session_recap", "s1", async () => message)).toBe(2);
    expect(await service.notifyOnce("u1", "session_recap", "s1", async () => message)).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("skips kinds the player turned off, without building the message", async () => {
    const { service, prefs } = fakes();
    prefs.set("u1", { ...DEFAULT_PREFS, weekly_recap: false });
    const build = vi.fn(async () => message);
    expect(await service.notifyOnce("u1", "weekly_recap", "2026-10-05", build)).toBe(0);
    expect(build).not.toHaveBeenCalled();
  });

  it("forgets gone devices and lets a later run retry when nothing was delivered", async () => {
    const { service, subs, log } = fakes({
      sender: { send: async () => ({ ok: false, gone: true, status: 410 }) },
    });
    expect(await service.notifyOnce("u1", "patch_heroes", "7.40", async () => message)).toBe(0);
    expect(subs.size).toBe(0);
    expect(log.size).toBe(0);
  });

  it("is off when there are no push keys", async () => {
    const { service, sent } = fakes({ sender: null });
    expect(service.enabled).toBe(false);
    expect(await service.notifyOnce("u1", "session_recap", "s1", async () => message)).toBe(0);
    expect((await service.status("u1")).enabled).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

function triggers(opts: {
  now: Date;
  session?: Awaited<ReturnType<LatestSessionSource["latest"]>>;
  week?: { games: number; wins: number; losses: number };
  patch?: { version: string; publishedAt: Date; heroIds: number[] } | null;
  language?: string | null;
  failSessions?: boolean;
}) {
  const f = fakes();
  const svc = new NotificationTriggersService({
    notifications: f.service,
    users: {
      byIds: async (ids) =>
        ids.map((id) => ({
          id,
          accountId32: 1,
          language: opts.language ?? null,
          timeZone: "Asia/Manila",
        })),
    },
    sessions: {
      latest: async () => {
        if (opts.failSessions) throw new Error("upstream down");
        return opts.session ?? null;
      },
    },
    weekly: { lastWeek: async () => opts.week ?? { games: 0, wins: 0, losses: 0 } },
    patches: { digest: async () => opts.patch ?? null },
    heroes: {
      names: async () =>
        new Map([
          [1, "Anti-Mage"],
          [2, "Axe"],
          [3, "Bane"],
          [4, "Bloodseeker"],
          [5, "Crystal Maiden"],
        ]),
    },
    logger: { warn: () => {} },
    now: () => opts.now,
  });
  return { svc, ...f };
}

// Thursday 2026-10-08, 14:30 in Manila.
const THURSDAY = new Date("2026-10-08T06:30:00Z");
// Monday 2026-10-12, 14:30 in Manila.
const MONDAY = new Date("2026-10-12T06:30:00Z");

describe("NotificationTriggersService", () => {
  const session = {
    id: "1:7000",
    endedAt: new Date(THURSDAY.getTime() - 10 * HOUR),
    gapMinutes: 60,
    games: 5,
    wins: 3,
    heroIds: [2, 1, 2],
  };

  it("recaps yesterday's finished session once, linking to it", async () => {
    const { svc, sent } = triggers({ now: THURSDAY, session });
    const run = await svc.runDaily({ budgetMs: 10_000 });
    expect(run).toMatchObject({ users: 1, sessionRecaps: 1, weeklyRecaps: 0, patchHeroes: 0 });
    expect(sent[0].message).toEqual({
      title: "Last session: 3W 2L",
      body: "5 games on Axe and Anti-Mage. See what went well and what didn't.",
      url: "/sessions/1%3A7000",
      tag: "session-recap",
    });
    expect((await svc.runDaily({ budgetMs: 10_000 })).sessionRecaps).toBe(0);
  });

  it("waits while a session may still be going, and ignores old ones", async () => {
    const going = { ...session, endedAt: new Date(THURSDAY.getTime() - 30 * 60_000) };
    expect(
      (await triggers({ now: THURSDAY, session: going }).svc.runDaily({ budgetMs: 1e4 }))
        .sessionRecaps,
    ).toBe(0);
    const old = { ...session, endedAt: new Date(THURSDAY.getTime() - 3 * 24 * HOUR) };
    expect(
      (await triggers({ now: THURSDAY, session: old }).svc.runDaily({ budgetMs: 1e4 }))
        .sessionRecaps,
    ).toBe(0);
  });

  it("sends the weekly recap on Monday only, and only after ranked games", async () => {
    const week = { games: 12, wins: 7, losses: 5 };
    expect(
      (await triggers({ now: THURSDAY, week }).svc.runDaily({ budgetMs: 1e4 })).weeklyRecaps,
    ).toBe(0);
    const empty = triggers({ now: MONDAY, week: { games: 0, wins: 0, losses: 0 } });
    expect((await empty.svc.runDaily({ budgetMs: 1e4 })).weeklyRecaps).toBe(0);
    const { svc, sent } = triggers({ now: MONDAY, week });
    expect((await svc.runDaily({ budgetMs: 1e4 })).weeklyRecaps).toBe(1);
    expect(sent[0].message.title).toBe("Your week: 7W 5L");
    expect(sent[0].message.body).toBe("12 ranked games last week. See your weekly recap.");
  });

  it("announces a patch once per version, naming up to three heroes", async () => {
    const { svc, sent } = triggers({
      now: THURSDAY,
      patch: {
        version: "7.40",
        publishedAt: new Date("2026-10-06T00:00:00Z"),
        heroIds: [1, 2, 3, 4, 5],
      },
    });
    expect((await svc.runDaily({ budgetMs: 1e4 })).patchHeroes).toBe(1);
    expect(sent[0].message.body).toBe(
      "Anti-Mage, Axe, Bane and 2 more changed. See what's different and how you've done since.",
    );
    expect(sent[0].message.url).toBe("/patches/7.40");
    expect((await svc.runDaily({ budgetMs: 1e4 })).patchHeroes).toBe(0);
  });

  it("doesn't announce a patch that came out weeks ago", async () => {
    const old = { version: "7.39", publishedAt: new Date("2026-09-01T00:00:00Z"), heroIds: [1] };
    expect(
      (await triggers({ now: THURSDAY, patch: old }).svc.runDaily({ budgetMs: 1e4 })).patchHeroes,
    ).toBe(0);
  });

  it("writes in the player's language", async () => {
    const { svc, sent } = triggers({ now: THURSDAY, session, language: "ceb" });
    await svc.runDaily({ budgetMs: 1e4 });
    expect(sent[0].message.title).toBe("Katapusang session: 3W 2L");
  });

  it("keeps going when one kind fails for a player", async () => {
    const { svc } = triggers({
      now: THURSDAY,
      failSessions: true,
      patch: { version: "7.40", publishedAt: new Date("2026-10-06T00:00:00Z"), heroIds: [2] },
    });
    const run = await svc.runDaily({ budgetMs: 1e4 });
    expect(run).toMatchObject({ failed: 1, patchHeroes: 1 });
  });

  it("does nothing when notifications are off", async () => {
    const f = fakes({ sender: null });
    const svc = new NotificationTriggersService({
      notifications: f.service,
      users: { byIds: vi.fn(async () => []) },
      sessions: { latest: async () => null },
      weekly: { lastWeek: async () => ({ games: 0, wins: 0, losses: 0 }) },
      patches: { digest: async () => null },
      heroes: { names: async () => new Map() },
      logger: { warn: () => {} },
    });
    expect((await svc.runDaily({ budgetMs: 1e4 })).users).toBe(0);
  });

  it("builds the test notification in the player's language", () => {
    const { svc } = triggers({ now: THURSDAY });
    expect(svc.testMessage("fil").title).toBe("Gumagana ang mga notification");
    expect(svc.testMessage(null).url).toBe("/account#notifications");
  });
});

// Keep the kinds list and the per-kind settings in step.
it("has a default for every kind", () => {
  const kinds: NotificationKind[] = ["session_recap", "weekly_recap", "patch_heroes"];
  expect(Object.keys(DEFAULT_PREFS).sort()).toEqual([...kinds].sort());
});
