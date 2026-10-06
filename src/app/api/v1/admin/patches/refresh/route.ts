import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin, requestId } from "@/common/http/http";
import { logger } from "@/common/logging/logger";
import { authService, SESSION_COOKIE } from "@/modules/identity";
import { MAX_IMPORT_COUNT } from "@/modules/patches/application/patch-import-service";
import { getPatchImportService } from "@/modules/patches/composition";

const BodySchema = z
  .object({
    /** Import one version (retry). */
    version: z.string().min(1).max(10).optional(),
    /** Otherwise import the newest `count` versions (default 3). */
    count: z.number().int().min(1).max(MAX_IMPORT_COUNT).optional(),
  })
  .strict();

/** Admin-only manual patch refresh (spec §2.3). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const auth = authService;
  const session = await auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return apiError("unauthorized", "Not signed in");
  if (!session.user.roles.includes("admin")) return apiError("forbidden", "Admins only");

  const text = await req.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return apiError("bad_request", "Body must be JSON");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return apiError("bad_request", "Invalid body", z.treeifyError(body.error));

  const service = await getPatchImportService();
  const started = Date.now();
  const log = { requestId: requestId(req), trigger: "admin", userId: session.user.id };

  if (body.data.version) {
    const outcome = await service.importVersion(body.data.version);
    logger.info("patch_refresh_completed", {
      ...log,
      durationMs: Date.now() - started,
      outcomes: [outcome],
    });
    return NextResponse.json({ outcomes: [outcome] });
  }

  const result = await service.importLatest(body.data.count);
  const durationMs = Date.now() - started;
  if (!result.ok) {
    logger.warn("patch_refresh_failed", { ...log, durationMs, reason: result.error.error.type });
    return apiError("upstream_unavailable", "The official patch feed is unavailable right now.", {
      reason: result.error.error.type,
    });
  }
  logger.info("patch_refresh_completed", { ...log, durationMs, outcomes: result.value });
  return NextResponse.json({ outcomes: result.value });
}
