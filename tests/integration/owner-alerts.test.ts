import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AlertLogRepository } from "@/modules/alerts/repositories/alert-log.repository";
import { AlertStateRepository } from "@/modules/alerts/repositories/alert-state.repository";
import { AlertThrottleRepository } from "@/modules/alerts/repositories/alert-throttle.repository";
import { OpsReportsRepository } from "@/modules/alerts/repositories/ops-reports.repository";
import { CronRunsRepository } from "@/modules/jobs/repositories/cron-runs.repository";
import { createTestDb } from "../support/mongo";

const H = 3_600_000;
const at = (ms: number) => new Date(Date.UTC(2026, 9, 16) + ms);

describe("owner alert repositories", () => {
  let db: Db;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ db, teardown } = await createTestDb());
    for (const repo of [
      new AlertLogRepository(async () => db),
      new AlertThrottleRepository(async () => db),
      new OpsReportsRepository(async () => db),
    ])
      await repo.ensureIndexes();
  });
  afterAll(async () => teardown?.());

  it("throttles a key until its window ends, across concurrent claims", async () => {
    const throttle = new AlertThrottleRepository(async () => db);
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => throttle.claim("cron_stale:matches", at(6 * H), at(0))),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await throttle.claim("cron_stale:matches", at(7 * H), at(5 * H))).toBe(false);
    // Another key is independent.
    expect(await throttle.claim("cron_stale:patches", at(6 * H), at(0))).toBe(true);
    // After the window (even before the TTL monitor removes it), exactly one claim wins.
    const later = await Promise.all(
      Array.from({ length: 3 }, () => throttle.claim("cron_stale:matches", at(12 * H), at(6 * H))),
    );
    expect(later.filter(Boolean)).toHaveLength(1);
    const indexes = await db.collection("owner_alert_throttle").indexes();
    expect(indexes.find((i) => i.name === "ttl_until")?.expireAfterSeconds).toBe(0);
  });

  it("logs alerts and backup reports, newest first", async () => {
    const log = new AlertLogRepository(async () => db);
    await log.insert({
      kind: "test",
      key: "test",
      vars: {},
      at: at(0),
      devices: 1,
      webhook: "off",
    });
    await log.insert({
      kind: "cron_failed",
      key: "cron_failed:patches",
      vars: { cron: "patches", error: "x" },
      at: at(H),
      devices: 0,
      webhook: "sent",
    });
    expect((await log.recent(5)).map((a) => a.kind)).toEqual(["cron_failed", "test"]);

    const reports = new OpsReportsRepository(async () => db);
    await reports.insert({ job: "backup", ok: true, details: "12 MB", runUrl: null, at: at(0) });
    await reports.insert({
      job: "restore-drill",
      ok: false,
      details: "users: 0",
      runUrl: null,
      at: at(H),
    });
    const recent = await reports.recent(5);
    expect(recent.map((r) => [r.job, r.ok])).toEqual([
      ["restore-drill", false],
      ["backup", true],
    ]);
    expect(recent[0].id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("keeps and clears the OpenDota down state", async () => {
    const state = new AlertStateRepository(async () => db);
    expect(await state.get("opendota")).toBeNull();
    await state.set("opendota", { downSince: at(0), lastDownAt: at(H) });
    expect(await state.get("opendota")).toEqual({ downSince: at(0), lastDownAt: at(H) });
    await state.set("opendota", null);
    expect(await state.get("opendota")).toBeNull();
  });

  it("reports when each daily job last completed on schedule", async () => {
    const runs = new CronRunsRepository(async () => db);
    expect(await runs.freshness(["patches", "matches"])).toEqual({
      lastOkAt: new Map(),
      firstRunAt: null,
    });
    const ok = await runs.start("patches", "cron");
    await runs.finish(ok, { ok: true, summary: {} });
    const failed = await runs.start("matches", "cron");
    await runs.finish(failed, { ok: false, summary: { error: "x" } });
    // A run from the admin page doesn't count as the schedule working.
    const manual = await runs.start("matches", "admin");
    await runs.finish(manual, { ok: true, summary: {} });
    const fresh = await runs.freshness(["patches", "matches"]);
    expect([...fresh.lastOkAt.keys()]).toEqual(["patches"]);
    expect(fresh.firstRunAt).toBeInstanceOf(Date);
  });
});
