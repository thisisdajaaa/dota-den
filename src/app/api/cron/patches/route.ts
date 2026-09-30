import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { apiError, requestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { draftInsights } from "@/modules/drafts/composition";
import { bucketedKey } from "@/modules/jobs/domain/job";
import { getJobQueue } from "@/modules/jobs/composition";
import { getPatchImportService } from "@/modules/patches/composition";

const DAY_MS = 24 * 3_600_000;

const digest = (s: string): Buffer => createHash("sha256").update(s).digest();

function authorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  // Compare fixed-length digests so the check doesn't leak length or prefix timing.
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/** Daily patch and tournament-data refresh, called by Vercel Cron (see vercel.json). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) return apiError("upstream_unavailable", "Cron is not configured");
  if (!authorized(req, secret)) return apiError("unauthorized", "Invalid cron credentials");

  const service = await getPatchImportService();
  const started = Date.now();
  // Refresh the cached tournament data alongside the patch (it's slow to query on demand).
  // Refresh the draft AI's tournament data: a retried background job with QStash, or right
  // here alongside the patch import without it.
  const queue = getJobQueue();
  const [result, tournaments] = await Promise.all([
    service.importLatest(),
    queue.durable
      ? queue
          .enqueue(
            "draft-meta-warm",
            {},
            { dedupKey: bucketedKey("draft-meta-warm", DAY_MS, Date.now()) },
          )
          .catch(() => "enqueue_failed")
      : draftInsights()
          .then((i) => i.warm())
          .catch(() => [{ key: "tournaments", ok: false }]),
  ]);
  logger.info("draft_meta_refresh", { requestId: requestId(req), tournaments });
  const log = { requestId: requestId(req), trigger: "cron", durationMs: Date.now() - started };

  if (!result.ok) {
    logger.warn("patch_refresh_failed", { ...log, reason: result.error.error.type });
    return apiError("upstream_unavailable", "The official patch feed is unavailable right now.", {
      reason: result.error.error.type,
    });
  }
  const failed = result.value.filter((o) => o.outcome === "failed");
  // Parser failures should alert (spec §10): log at warn with the reasons.
  if (failed.length > 0) logger.warn("patch_import_degraded", { ...log, failed });
  logger.info("patch_refresh_completed", { ...log, outcomes: result.value });
  return NextResponse.json({ outcomes: result.value });
}
