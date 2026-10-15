import { describe, expect, it, vi } from "vitest";
import {
  ALERT_THROTTLE_MS,
  CRON_STALE_MS,
  cronRunAlerts,
  nextDownState,
  observeOpenDota,
  opsReportAlert,
  OPENDOTA_SUSTAINED_MS,
  staleCronAlerts,
  type Alert,
  type DownState,
} from "@/modules/alerts/domain/alert-rules";
import type { OpsReport, OwnerAlert } from "@/modules/alerts/alerts.model";
import { DiscordAlertWebhook } from "@/modules/alerts/infrastructure/discord-alert-webhook";
import { OpsMonitorService } from "@/modules/alerts/services/ops-monitor.service";
import { OwnerAlertsService } from "@/modules/alerts/services/owner-alerts.service";
import { CronService } from "@/modules/jobs/services/cron.service";

const H = 3_600_000;
const at = (ms: number) => new Date(Date.UTC(2026, 9, 16) + ms);
const logger = { info: () => {}, warn: () => {} };

describe("alert rules", () => {
  it("alerts on a failed run, a degraded patch import and many failed accounts", () => {
    expect(cronRunAlerts("matches", { ok: false, summary: { error: "db down" } })).toEqual([
      {
        kind: "cron_failed",
        key: "cron_failed:matches",
        vars: { cron: "matches", error: "db down" },
      },
    ]);
    // Patches with parser failures: degraded, whatever ok says.
    expect(
      cronRunAlerts("patches", { ok: false, summary: { imported: 3, failed: 1 } }).map(
        (a) => a.kind,
      ),
    ).toEqual(["patch_import"]);
    expect(
      cronRunAlerts("patches", { ok: false, summary: { error: "upstream_unavailable" } })[0].vars,
    ).toEqual({ cron: "patches", error: "upstream_unavailable" });
    expect(cronRunAlerts("patches", { ok: true, summary: { imported: 2, failed: 0 } })).toEqual([]);

    const sync = (failed: number, accounts: number, skipped = 0) =>
      cronRunAlerts("matches", {
        ok: true,
        summary: {
          accounts,
          skipped,
          failed: Array.from({ length: failed }, (_, i) => ({
            accountId32: i,
            outcome: "provider",
          })),
        },
      });
    // 3 of 10 tried (30% > 20%): alert. Skipped accounts weren't tried.
    expect(sync(3, 12, 2)).toEqual([
      {
        kind: "match_sync_failures",
        key: "match_sync_failures",
        vars: { failed: 3, accounts: 10, percent: 30 },
      },
    ]);
    expect(sync(2, 10)).toEqual([]); // 20% is not more than 20%
    expect(sync(1, 2)).toEqual([]); // one private profile isn't news
  });

  it("finds daily jobs that haven't completed within 26 hours", () => {
    const now = at(30 * H);
    const fresh = { lastOkAt: new Map([["patches", at(10 * H)]]), firstRunAt: at(0) };
    // matches never completed since the first run 30 h ago; patches did 20 h ago.
    expect(staleCronAlerts(fresh, now)).toEqual([
      { kind: "cron_stale", key: "cron_stale:matches", vars: { cron: "matches", hours: 30 } },
    ]);
    expect(staleCronAlerts({ lastOkAt: new Map(), firstRunAt: null }, now)).toEqual([]);
    const both = new Map([
      ["patches", at(30 * H - CRON_STALE_MS)],
      ["matches", at(29 * H)],
    ]);
    expect(staleCronAlerts({ lastOkAt: both, firstRunAt: at(0) }, now)).toEqual([]);
  });

  it("judges OpenDota from the circuit, the latest calls and the match sync", () => {
    const health = (s: number | null, f: number | null, circuitOpen = false) => ({
      circuitOpen,
      lastSuccessAt: s,
      lastFailureAt: f,
    });
    expect(observeOpenDota({ health: health(null, null) })).toBe("unknown");
    expect(observeOpenDota({ health: null })).toBe("unknown");
    expect(observeOpenDota({ health: health(5, 3) })).toBe("up");
    expect(observeOpenDota({ health: health(3, 5) })).toBe("down");
    expect(observeOpenDota({ health: health(9, 5, true) })).toBe("down");
    expect(
      observeOpenDota({ health: health(9, null), matchRun: { attempted: 4, upstream: 2 } }),
    ).toBe("down");
    expect(
      observeOpenDota({ health: health(null, null), matchRun: { attempted: 4, upstream: 0 } }),
    ).toBe("up");
  });

  it("alerts only when OpenDota stays down across checks", () => {
    const first = nextDownState(null, "down", at(0));
    expect(first.alert).toBeNull();
    expect(first.state).toEqual({ downSince: at(0), lastDownAt: at(0) });
    // The matches cron 30 minutes after the patches cron: still down.
    const second = nextDownState(first.state, "down", at(30 * 60_000));
    expect(second.alert).toEqual({
      kind: "opendota_down",
      key: "opendota_down",
      vars: { minutes: 30 },
    });
    expect(nextDownState(first.state, "down", at(OPENDOTA_SUSTAINED_MS - 1)).alert).toBeNull();
    // Up clears it; unknown keeps it; a day later is a new episode.
    expect(nextDownState(first.state, "up", at(H)).state).toBeNull();
    expect(nextDownState(first.state, "unknown", at(H)).state).toBe(first.state);
    const nextDay = nextDownState(first.state, "down", at(24 * H));
    expect(nextDay.alert).toBeNull();
    expect(nextDay.state?.downSince).toEqual(at(24 * H));
  });

  it("alerts on failed backups and drills only", () => {
    expect(opsReportAlert({ job: "backup", ok: true, details: "" })).toBeNull();
    expect(opsReportAlert({ job: "restore-drill", ok: false, details: " users: 0 " })).toEqual({
      kind: "backup_failed",
      key: "ops_failed:restore-drill",
      vars: { job: "restore-drill", details: "users: 0" },
    });
  });
});

function alertsService(
  opts: {
    claim?: (key: string) => boolean;
    webhook?: "sent" | "failed" | null;
    pushEnabled?: boolean;
  } = {},
) {
  const logged: Array<Omit<OwnerAlert, "id">> = [];
  const pushed: Array<{ userId: string; title: string }> = [];
  const posted: Array<{ title: string; body: string }> = [];
  const svc = new OwnerAlertsService({
    log: { insert: async (a) => void logged.push(a), recent: async () => [] },
    throttle: { claim: async (key) => opts.claim?.(key) ?? true },
    recipients: {
      admins: async () => [
        { id: "owner", language: "fil" },
        { id: "helper", language: null },
      ],
    },
    push: {
      enabled: opts.pushEnabled ?? true,
      deliver: async (userId, m) => {
        pushed.push({ userId, title: m.title });
        return userId === "owner" ? 2 : 0;
      },
    },
    webhook:
      opts.webhook === null
        ? null
        : { post: async (m) => (posted.push(m), opts.webhook ?? "sent") },
    logger,
    now: () => at(0),
  });
  return { svc, logged, pushed, posted };
}

describe("OwnerAlertsService", () => {
  const alert: Alert = {
    kind: "cron_stale",
    key: "cron_stale:matches",
    vars: { cron: "matches", hours: 30 },
  };

  it("pushes to every admin in their language, posts to Discord in English and logs it", async () => {
    const { svc, logged, pushed, posted } = alertsService();
    expect(await svc.raise(alert)).toEqual({ devices: 2, webhook: "sent" });
    expect(pushed).toEqual([
      { userId: "owner", title: "Tumigil ang daily job: matches" },
      { userId: "helper", title: "Daily job stopped: matches" },
    ]);
    expect(posted).toEqual([
      {
        title: "Daily job stopped: matches",
        body: "matches hasn't completed in 30 hours. Check Vercel Cron and CRON_SECRET.",
      },
    ]);
    expect(logged).toEqual([
      {
        kind: "cron_stale",
        key: "cron_stale:matches",
        vars: alert.vars,
        at: at(0),
        devices: 2,
        webhook: "sent",
      },
    ]);
  });

  it("sends nothing while the key is throttled", async () => {
    const claim = vi.fn(() => false);
    const { svc, logged, pushed, posted } = alertsService({ claim });
    expect(await svc.raise(alert)).toBeNull();
    expect(claim).toHaveBeenCalledWith("cron_stale:matches");
    expect([logged, pushed, posted]).toEqual([[], [], []]);
  });

  it("claims the key for six hours", async () => {
    const claims: Array<[string, Date, Date]> = [];
    const svc = new OwnerAlertsService({
      log: { insert: async () => {}, recent: async () => [] },
      throttle: { claim: async (...args) => (claims.push(args), true) },
      recipients: { admins: async () => [] },
      push: { enabled: false, deliver: async () => 0 },
      webhook: null,
      logger,
      now: () => at(0),
    });
    expect(await svc.raise(alert)).toEqual({ devices: 0, webhook: "off" });
    expect(claims).toEqual([["cron_stale:matches", at(ALERT_THROTTLE_MS), at(0)]]);
  });

  it("sends a test alert without throttling, and records a failed Discord post", async () => {
    const claim = vi.fn(() => false);
    const { svc, logged } = alertsService({ claim, webhook: "failed", pushEnabled: false });
    expect(await svc.sendTest()).toEqual({ devices: 0, webhook: "failed" });
    expect(claim).not.toHaveBeenCalled();
    expect(logged[0]).toMatchObject({ kind: "test", devices: 0, webhook: "failed" });
  });
});

function monitor(
  opts: {
    lastOkAt?: Map<string, Date>;
    firstRunAt?: Date | null;
    health?: { circuitOpen: boolean; lastSuccessAt: number | null; lastFailureAt: number | null };
    state?: DownState | null;
    now?: Date;
    raiseThrows?: boolean;
  } = {},
) {
  const raised: Alert[] = [];
  const reports: Array<Omit<OpsReport, "id">> = [];
  let state = opts.state ?? null;
  const svc = new OpsMonitorService({
    alerts: {
      raise: async (a) => {
        if (opts.raiseThrows) throw new Error("db");
        raised.push(a);
        return { devices: 1, webhook: "off" };
      },
    },
    crons: {
      freshness: async () => ({
        lastOkAt: opts.lastOkAt ?? new Map(),
        firstRunAt: opts.firstRunAt ?? null,
      }),
    },
    upstream: { openDota: () => opts.health ?? null },
    state: {
      get: async () => state,
      set: async (_name, next) => void (state = next),
    },
    reports: { insert: async (r) => void reports.push(r), recent: async () => [] },
    logger,
    now: () => opts.now ?? at(30 * H),
  });
  return { svc, raised, reports, state: () => state };
}

describe("OpsMonitorService", () => {
  it("after a run: its own alerts, stale jobs and sustained OpenDota trouble", async () => {
    const m = monitor({
      lastOkAt: new Map([["matches", at(29 * H)]]),
      firstRunAt: at(0),
      health: { circuitOpen: true, lastSuccessAt: null, lastFailureAt: 1 },
      state: { downSince: at(29.5 * H), lastDownAt: at(29.5 * H) },
    });
    const sent = await m.svc.cronFinished("matches", { ok: false, summary: { error: "boom" } });
    expect(sent.map((a) => a.key)).toEqual([
      "cron_failed:matches",
      "cron_stale:patches",
      "opendota_down",
    ]);
    expect(m.raised).toEqual(sent);
  });

  it("remembers OpenDota trouble and forgets it once it answers again", async () => {
    const down = monitor({ health: { circuitOpen: true, lastSuccessAt: null, lastFailureAt: 1 } });
    expect(await down.svc.cronFinished("patches", { ok: true, summary: {} })).toEqual([]);
    expect(down.state()).toEqual({ downSince: at(30 * H), lastDownAt: at(30 * H) });

    const up = monitor({
      health: { circuitOpen: false, lastSuccessAt: 5, lastFailureAt: 1 },
      state: { downSince: at(29 * H), lastDownAt: at(29 * H) },
    });
    await up.svc.cronFinished("patches", { ok: true, summary: {} });
    expect(up.state()).toBeNull();
  });

  it("never throws, even when alerting fails", async () => {
    const m = monitor({ raiseThrows: true });
    await expect(m.svc.cronFinished("matches", { ok: false, summary: {} })).resolves.toEqual([]);
  });

  it("records backup reports, alerts on failure and checks the daily jobs", async () => {
    const m = monitor({ firstRunAt: at(0), lastOkAt: new Map([["patches", at(29 * H)]]) });
    expect(
      await m.svc.recordReport({ job: "backup", ok: true, details: "12 MB", runUrl: null }),
    ).toEqual({ recorded: true, alerted: false });
    expect(m.reports[0]).toMatchObject({ job: "backup", ok: true, at: at(30 * H) });
    // The nightly backup also notices the match sync stopped.
    expect(m.raised.map((a) => a.key)).toEqual(["cron_stale:matches"]);

    const failed = await m.svc.recordReport({
      job: "restore-drill",
      ok: false,
      details: "users: 0",
      runUrl: "https://github.com/o/r/actions/runs/1",
    });
    expect(failed.alerted).toBe(true);
    expect(m.raised.map((a) => a.key)).toContain("ops_failed:restore-drill");
  });
});

describe("CronService monitor", () => {
  it("tells the monitor about every finished run, and survives it failing", async () => {
    const seen: Array<[string, boolean]> = [];
    const make = (fail: boolean) =>
      new CronService({
        runs: { start: async () => "r", finish: async () => {} },
        matches: {
          sync: async () => ({ ok: true, value: { backfillComplete: true } }),
          syncDue: async () => [{ accountId32: 1, outcome: "synced" }],
        },
        medals: { currentRankTier: async () => null, record: async () => {} },
        patches: { importLatest: async () => ({ ok: true, value: [{ outcome: "failed" }] }) },
        caches: { warmDraftData: async () => [], warmMeta: async () => [] },
        monitor: {
          cronFinished: async (name, r) => {
            seen.push([name, r.ok]);
            if (fail) throw new Error("monitor down");
          },
        },
        queue: () => ({ durable: false, enqueue: async () => "skipped" as const }),
        logger,
      });
    await make(false).runMatchSync("cron");
    await make(true).runPatchRefresh("cron", "req");
    expect(seen).toEqual([
      ["matches", true],
      ["patches", false],
    ]);
  });
});

describe("DiscordAlertWebhook", () => {
  it("posts an embed to the rebuilt URL, never following redirects or pinging anyone", async () => {
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const hook = new DiscordAlertWebhook(
      { origin: "https://discord.com", id: "123456789012345678", token: "t".repeat(68) },
      fetch as unknown as typeof globalThis.fetch,
    );
    expect(await hook.post({ title: "Test alert", body: "@everyone hi" })).toBe("sent");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://discord.com/api/webhooks/123456789012345678/${"t".repeat(68)}`);
    expect(init?.redirect).toBe("manual");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      embeds: [{ title: "Test alert", description: "@everyone hi" }],
      allowed_mentions: { parse: [] },
    });
    fetch.mockResolvedValueOnce(new Response(null, { status: 302 }));
    expect(await hook.post({ title: "x", body: "y" })).toBe("failed");
    fetch.mockRejectedValueOnce(new Error("timeout"));
    expect(await hook.post({ title: "x", body: "y" })).toBe("failed");
  });
});
