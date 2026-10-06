import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobRunsRepository } from "@/modules/jobs/repositories/job-runs.repository";
import { createTestDb } from "../support/mongo";

describe("JobRunsRepository", () => {
  let db: Db;
  let teardown: () => Promise<void>;
  let repo: JobRunsRepository;
  const now = new Date("2026-09-30T00:00:00Z");

  beforeAll(async () => {
    ({ db, teardown } = await createTestDb());
    repo = new JobRunsRepository(async () => db);
    await repo.ensureIndexes();
  });
  afterAll(async () => teardown?.());

  it("skips a dedup key only after it succeeded, and keeps failed runs retryable", async () => {
    const first = await repo.begin("match-backfill", "backfill:1@5", now);
    expect(first.status).toBe("started");
    if (first.status !== "started") return;
    await repo.finish(first.runId, { ok: false, error: "upstream 503" }, now);

    // A failed run doesn't block a retry.
    const retry = await repo.begin("match-backfill", "backfill:1@5", now);
    expect(retry.status).toBe("started");
    if (retry.status !== "started") return;
    await repo.finish(retry.runId, { ok: true }, now);

    expect(await repo.begin("match-backfill", "backfill:1@5", now)).toEqual({
      status: "already_done",
    });
    // Same key for a different job is independent; no key always runs.
    expect((await repo.begin("draft-meta-warm", "backfill:1@5", now)).status).toBe("started");
    expect((await repo.begin("draft-meta-warm", null, now)).status).toBe("started");

    const docs = await db.collection("job_runs").find({ name: "match-backfill" }).toArray();
    expect(docs.map((d) => d.status).sort()).toEqual(["failed", "succeeded"]);
    expect(docs.find((d) => d.status === "failed")?.error).toBe("upstream 503");
    expect(docs[0].expiresAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
